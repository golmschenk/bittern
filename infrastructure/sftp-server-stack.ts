import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import {Construct} from 'constructs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import {BitternBaseStack, BitternBaseStackProps} from './bittern-base-stack';
import {allUsers} from './ssh-users';

interface SftpServerStackProps extends BitternBaseStackProps {
    userBucketAccessMapping: {username: string; buckets: s3.Bucket[]}[];
}

export class SftpServerStack extends BitternBaseStack {
    constructor(scope: Construct, id: string, props: SftpServerStackProps) {
        super(scope, id, props);

        const vpc = new ec2.Vpc(this, 'sftp-server-stack-vpc', {
            maxAzs: 2,
            natGateways: 0,
            subnetConfiguration: [
                {
                    name: 'public',
                    subnetType: ec2.SubnetType.PUBLIC,
                },
                {
                    name: 'isolated',
                    subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
                },
            ],
        });

        vpc.addGatewayEndpoint('sftp-server-stack-s3-gateway-endpoint', {
            service: ec2.GatewayVpcEndpointAwsService.S3,
        });

        const databaseSecurityGroup = new ec2.SecurityGroup(this, 'sftp-server-stack-database-security-group', {
            vpc,
        });

        const databaseName = 'sftp_server';
        const databaseCluster = new rds.DatabaseCluster(this, 'sftp-server-stack-database', {
            engine: rds.DatabaseClusterEngine.auroraPostgres({
                version: rds.AuroraPostgresEngineVersion.VER_16_4,
            }),
            defaultDatabaseName: databaseName,
            credentials: rds.Credentials.fromGeneratedSecret('sftpgo', {
                secretName: 'sftp-server/database-credentials',
            }),
            serverlessV2MinCapacity: 0.5,
            serverlessV2MaxCapacity: 4,
            writer: rds.ClusterInstance.serverlessV2('sftp-server-stack-database-writer'),
            vpc,
            vpcSubnets: {subnetType: ec2.SubnetType.PRIVATE_ISOLATED},
            securityGroups: [databaseSecurityGroup],
        });

        const cluster = new ecs.Cluster(this, 'sftp-server-stack-fargate-cluster', {vpc});

        const taskDefinition = new ecs.FargateTaskDefinition(this, 'sftp-server-stack-fargate-task-definition',
            {
                memoryLimitMiB: 512,
                cpu: 256,
                runtimePlatform: {
                    cpuArchitecture: ecs.CpuArchitecture.ARM64,
                },
            },
        );

        const allBuckets = [...new Set(props.userBucketAccessMapping.flatMap(
            (userBucketAccess) => userBucketAccess.buckets))];

        for (const bucket of allBuckets) {
            bucket.grantReadWrite(taskDefinition.taskRole);
        }

        const sftpgoLoadDataJson = {
            version: 15,
            folders: allBuckets.map((bucket) => ({
                name: bucket.bucketName,
                filesystem: {
                    provider: 1,
                    s3config: {
                        bucket: bucket.bucketName,
                        region: cdk.Stack.of(bucket).region,
                    },
                },
            })),
            users: props.userBucketAccessMapping.map(({username, buckets}) => ({
                username,
                status: 1,
                home_dir: `/tmp/users/${username}`,
                permissions: Object.fromEntries([
                    ['/', ['list']],
                    ...buckets.map((bucket) => [`/${bucket.bucketName}`, ['*']]),
                ]),
                public_keys: [allUsers[username]],
                virtual_folders: buckets.map((bucket) => ({
                    name: bucket.bucketName,
                    virtual_path: `/${bucket.bucketName}`,
                })),
            })),
        };

        const sftpgoDefaultAdminSecret = new secretsmanager.Secret(this, 'SftpGoAdminSecret', {
            secretName: 'sftp-server/administrator-credentials',
            generateSecretString: {
                secretStringTemplate: JSON.stringify({username: 'administrator'}),
                generateStringKey: 'password',
                excludePunctuation: true,
            },
        });
        sftpgoDefaultAdminSecret.grantRead(taskDefinition.taskRole);

        databaseCluster.secret!.grantRead(taskDefinition.taskRole);

        const container = taskDefinition.addContainer('sftp-server-stack-fargate-task', {
            image: ecs.ContainerImage.fromRegistry('drakkan/sftpgo:v2.7-alpine'),
            command: [
                'sh', '-c',
                `echo '${JSON.stringify(sftpgoLoadDataJson)}' > /tmp/sftpgo-loaddata.json && sftpgo serve`,
            ],
            environment: {
                SFTPGO_DATA_PROVIDER__DRIVER: 'postgresql',
                SFTPGO_DATA_PROVIDER__NAME: databaseName,
                SFTPGO_DATA_PROVIDER__HOST: databaseCluster.clusterEndpoint.hostname,
                SFTPGO_DATA_PROVIDER__PORT: databaseCluster.clusterEndpoint.port.toString(),
                SFTPGO_DATA_PROVIDER__CREATE_DEFAULT_ADMIN: 'true',
                SFTPGO_LOADDATA_FROM: '/tmp/sftpgo-loaddata.json',
                SFTPGO_LOADDATA_CLEAN: '0',
            },
            secrets: {
                SFTPGO_DATA_PROVIDER__USERNAME: ecs.Secret.fromSecretsManager(
                    databaseCluster.secret!, 'username',
                ),
                SFTPGO_DATA_PROVIDER__PASSWORD: ecs.Secret.fromSecretsManager(
                    databaseCluster.secret!, 'password',
                ),
                SFTPGO_DEFAULT_ADMIN_USERNAME: ecs.Secret.fromSecretsManager(
                    sftpgoDefaultAdminSecret, 'username',
                ),
                SFTPGO_DEFAULT_ADMIN_PASSWORD: ecs.Secret.fromSecretsManager(
                    sftpgoDefaultAdminSecret, 'password',
                ),
            },
        });

        container.addPortMappings(
            {containerPort: 2022, protocol: ecs.Protocol.TCP},
            {containerPort: 8080, protocol: ecs.Protocol.TCP},
        );

        const fargateSecurityGroup = new ec2.SecurityGroup(
            this, 'sftp-server-stack-security-group', {
                vpc,
            });

        databaseSecurityGroup.addIngressRule(
            fargateSecurityGroup,
            ec2.Port.tcp(databaseCluster.clusterEndpoint.port),
            'sftp-server-stack-fargate-to-database-rule',
        );

        const fargateService = new ecs.FargateService(this, 'sftp-server-stack-fargate-service', {
            cluster,
            taskDefinition,
            desiredCount: 1,
            minHealthyPercent: 100,
            assignPublicIp: true,
            vpcSubnets: {subnetType: ec2.SubnetType.PUBLIC},
            securityGroups: [fargateSecurityGroup],
        });

        const elasticIp0 = new ec2.CfnEIP(this, 'sftp-server-stack-elastic-ip0');
        const elasticIp1 = new ec2.CfnEIP(this, 'sftp-server-stack-elastic-ip1');

        const networkLoadBalancer = new elbv2.NetworkLoadBalancer(this, 'sftp-server-stack-network-load-balancer', {
            vpc,
            internetFacing: true,
            crossZoneEnabled: true,
        });

        const publicSubnets = vpc.selectSubnets({subnetType: ec2.SubnetType.PUBLIC}).subnets;
        const elasticIps = [elasticIp0, elasticIp1];
        const cfnNlb = networkLoadBalancer.node.defaultChild as elbv2.CfnLoadBalancer;
        cfnNlb.addPropertyDeletionOverride('Subnets');
        cfnNlb.subnetMappings = publicSubnets.map((subnet, index) => ({
            subnetId: subnet.subnetId,
            allocationId: elasticIps[index].attrAllocationId,
        }));

        const networkLoadBalancerListener = networkLoadBalancer.addListener(
            'sftp-server-stack-network-load-balancer-sftp-listener', {
                port: 2022,
                protocol: elbv2.Protocol.TCP,
            });
        networkLoadBalancerListener.addTargets('sftp-server-stack-network-load-balancer-sftp-target', {
            port: 2022,
            protocol: elbv2.Protocol.TCP,
            targets: [fargateService],
            healthCheck: {
                port: '8080',
                protocol: elbv2.Protocol.HTTP,
                path: '/healthz',
            },
        });

        const httpListener = networkLoadBalancer.addListener(
            'sftp-server-stack-network-load-balancer-http-listener', {
                port: 8080,
                protocol: elbv2.Protocol.TCP,
            });
        httpListener.addTargets('sftp-server-stack-network-load-balancer-http-target', {
            port: 8080,
            protocol: elbv2.Protocol.TCP,
            targets: [fargateService],
            healthCheck: {
                port: '8080',
                protocol: elbv2.Protocol.HTTP,
                path: '/healthz',
            },
        });

        fargateSecurityGroup.addIngressRule(
            ec2.Peer.anyIpv4(),
            ec2.Port.tcp(2022),
            'sftp-server-stack-inbound-sftp-traffic-rule',
        );
        fargateSecurityGroup.addIngressRule(
            ec2.Peer.anyIpv4(),
            ec2.Port.tcp(8080),
            'sftp-server-stack-inbound-http-traffic-rule',
        );
    }
}

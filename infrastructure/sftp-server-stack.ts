import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elb from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import {Construct} from 'constructs';
import {NenaBaseStack, NenaBaseStackProps} from './nena-base-stack';
import {userToPublicSshKeyRecord} from './ssh-users';

interface SftpServerStackProps extends NenaBaseStackProps {
    userBucketAccessMapping: {username: string; buckets: s3.Bucket[]}[];
}

export class SftpServerStack extends NenaBaseStack {
    constructor(scope: Construct, id: string, props: SftpServerStackProps) {
        super(scope, id, props);

        const vpc = new ec2.Vpc(this, 'SftpServerStackVpc', {
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

        vpc.addGatewayEndpoint('SftpServerStackS3GatewayEndpoint', {
            service: ec2.GatewayVpcEndpointAwsService.S3,
        });

        vpc.addInterfaceEndpoint('SecretsManagerEndpoint', {
            service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
            subnets: { subnetType: ec2.SubnetType.PUBLIC },
        });

        vpc.addInterfaceEndpoint('CloudWatchLogsEndpoint', {
            service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
            subnets: { subnetType: ec2.SubnetType.PUBLIC },
        });

        vpc.addInterfaceEndpoint('EcrDockerEndpoint', {
            service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
            subnets: { subnetType: ec2.SubnetType.PUBLIC },
        });

        vpc.addInterfaceEndpoint('EcrApiEndpoint', {
            service: ec2.InterfaceVpcEndpointAwsService.ECR,
            subnets: { subnetType: ec2.SubnetType.PUBLIC },
        });

        const databaseSecurityGroup = new ec2.SecurityGroup(this, 'SftpServerStackDatabaseSecurityGroup', {
            vpc,
        });

        const databaseName = 'sftp_server';
        const databaseCluster = new rds.DatabaseCluster(this, 'SftpServerStackDatabase', {
            engine: rds.DatabaseClusterEngine.auroraPostgres({
                version: rds.AuroraPostgresEngineVersion.VER_16_4,
            }),
            defaultDatabaseName: databaseName,
            credentials: rds.Credentials.fromGeneratedSecret('sftpgo', {
                secretName: 'sftp-server0/database-credentials',
            }),
            serverlessV2MinCapacity: 0.5,
            serverlessV2MaxCapacity: 4,
            writer: rds.ClusterInstance.serverlessV2('SftpServerStackDatabaseWriter'),
            vpc,
            vpcSubnets: {subnetType: ec2.SubnetType.PRIVATE_ISOLATED},
            securityGroups: [databaseSecurityGroup],
        });

        const cluster = new ecs.Cluster(this, 'SftpServerStackFargateCluster', {vpc});

        const taskDefinition = new ecs.FargateTaskDefinition(this, 'SftpServerStackFargateTaskDefinition',
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
                public_keys: [userToPublicSshKeyRecord[username]],
                virtual_folders: buckets.map((bucket) => ({
                    name: bucket.bucketName,
                    virtual_path: `/${bucket.bucketName}`,
                })),
            })),
        };

        databaseCluster.secret!.grantRead(taskDefinition.taskRole);

        const container = taskDefinition.addContainer('SftpServerStackFargateTask', {
            image: ecs.ContainerImage.fromRegistry('drakkan/sftpgo:v2.7-alpine'),
            command: [
                'sh', '-c',
                `echo '${JSON.stringify(sftpgoLoadDataJson)}' > /tmp/sftpgo-loaddata.json && sftpgo serve`,
            ],
            logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'SftpServerStackFargateTask' }),
            environment: {
                SFTPGO_DATA_PROVIDER__DRIVER: 'postgresql',
                SFTPGO_DATA_PROVIDER__NAME: databaseName,
                SFTPGO_DATA_PROVIDER__HOST: databaseCluster.clusterEndpoint.hostname,
                SFTPGO_DATA_PROVIDER__PORT: databaseCluster.clusterEndpoint.port.toString(),
                SFTPGO_LOADDATA_FROM: '/tmp/sftpgo-loaddata.json',
                SFTPGO_LOADDATA_MODE: '0',
            },
            secrets: {
                SFTPGO_DATA_PROVIDER__USERNAME: ecs.Secret.fromSecretsManager(
                    databaseCluster.secret!, 'username',
                ),
                SFTPGO_DATA_PROVIDER__PASSWORD: ecs.Secret.fromSecretsManager(
                    databaseCluster.secret!, 'password',
                ),
            },
        });

        container.addPortMappings(
            {containerPort: 2022, protocol: ecs.Protocol.TCP},
        );

        const fargateSecurityGroup = new ec2.SecurityGroup(
            this, 'SftpServerStackSecurityGroup', {
                vpc,
            });

        databaseSecurityGroup.addIngressRule(
            fargateSecurityGroup,
            ec2.Port.tcp(databaseCluster.clusterEndpoint.port),
            'SftpServerStackFargateToDatabaseRule',
        );

        const fargateService = new ecs.FargateService(this, 'SftpServerStackFargateService', {
            cluster,
            taskDefinition,
            desiredCount: 1,
            minHealthyPercent: 100,
            assignPublicIp: true,
            vpcSubnets: {subnetType: ec2.SubnetType.PUBLIC},
            securityGroups: [fargateSecurityGroup],
        });
        fargateService.node.addDependency(databaseCluster);

        const elasticIp0 = new ec2.CfnEIP(this, 'SftpServerStackElasticIp0');
        const elasticIp1 = new ec2.CfnEIP(this, 'SftpServerStackElasticIp1');

        const networkLoadBalancer = new elb.NetworkLoadBalancer(this, 'SftpServerStackNetworkLoadBalancer', {
            vpc,
            internetFacing: true,
            crossZoneEnabled: true,
        });

        const publicSubnets = vpc.selectSubnets({subnetType: ec2.SubnetType.PUBLIC}).subnets;
        const elasticIps = [elasticIp0, elasticIp1];
        const cfnNlb = networkLoadBalancer.node.defaultChild as elb.CfnLoadBalancer;
        cfnNlb.addPropertyDeletionOverride('Subnets');
        cfnNlb.subnetMappings = publicSubnets.map((subnet, index) => ({
            subnetId: subnet.subnetId,
            allocationId: elasticIps[index].attrAllocationId,
        }));

        const networkLoadBalancerListener = networkLoadBalancer.addListener(
            'SftpServerStackNetworkLoadBalancerSftpListener', {
                port: 22,
                protocol: elb.Protocol.TCP,
            });
        networkLoadBalancerListener.addTargets('SftpServerStackNetworkLoadBalancerSftpTarget', {
            port: 2022,
            protocol: elb.Protocol.TCP,
            targets: [fargateService],
            healthCheck: {
                port: '2022',
                protocol: elb.Protocol.TCP,
            },
        });

        fargateSecurityGroup.addIngressRule(
            ec2.Peer.anyIpv4(),
            ec2.Port.tcp(2022),
            'SftpServerStackInboundSftpTrafficRule',
        );

        networkLoadBalancer.connections.allowTo(
            fargateService, ec2.Port.tcp(2022), 'NLB to Fargate health check and traffic');
        networkLoadBalancer.connections.allowFromAnyIpv4(ec2.Port.tcp(22), 'Allow inbound SFTP traffic');
    }
}

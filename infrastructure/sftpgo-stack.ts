import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import {Construct} from 'constructs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import {BitternBaseStack, BitternBaseStackProps} from './bittern-base-stack';

interface SftpGoStackProps extends BitternBaseStackProps {
    buckets: [s3.Bucket];
}

export class SftpGoStackStack extends BitternBaseStack {
    constructor(scope: Construct, id: string, props: SftpGoStackProps) {
        super(scope, id, props);

        const vpc = new ec2.Vpc(this, 'sftp-server-stack-vpc', {
            maxAzs: 1,
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
            description: 'Security group for Aurora Serverless PostgreSQL',
        });

        const databaseName = 'sftp_server_database';
        const databaseCluster = new rds.DatabaseCluster(this, 'sftp-server-stack-database', {
            engine: rds.DatabaseClusterEngine.auroraPostgres({
                version: rds.AuroraPostgresEngineVersion.VER_16_4,
            }),
            defaultDatabaseName: databaseName,
            credentials: rds.Credentials.fromGeneratedSecret('sftpgo', {
                secretName: 'sftpgo/db-credentials',
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

        for (const bucket of props.buckets) {
            bucket.grantReadWrite(taskDefinition.taskRole);
        }

        const adminSecret = new secretsmanager.Secret(this, 'SftpGoAdminSecret', {
            secretName: 'sftpgo/admin-credentials',
            generateSecretString: {
                secretStringTemplate: JSON.stringify({ username: 'admin' }),
                generateStringKey: 'password',
                excludePunctuation: true,
                passwordLength: 24,
            },
        });
        adminSecret.grantRead(taskDefinition.taskRole);

        databaseCluster.secret!.grantRead(taskDefinition.taskRole);

        // TODO: continuing from here.
        const container = taskDefinition.addContainer('sftp-server-stack-fargate-task', {
            image: ecs.ContainerImage.fromRegistry('drakkan/sftpgo:v2.7-alpine'),
            environment: {
                SFTPGO_DATA_PROVIDER__DRIVER: 'postgresql',
                SFTPGO_DATA_PROVIDER__NAME: databaseName,
                SFTPGO_DATA_PROVIDER__HOST: databaseCluster.clusterEndpoint.hostname,
                SFTPGO_DATA_PROVIDER__PORT: databaseCluster.clusterEndpoint.port.toString(),
                SFTPGO_DATA_PROVIDER__CREATE_DEFAULT_ADMIN: 'true',
            },
            secrets: {
                // Inject DB username + password from the generated secret
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
            {containerPort: 8080, protocol: ecs.Protocol.TCP},
        );

        // -------------------------------------------------------
        // Security Groups
        // -------------------------------------------------------
        const serviceSg = new ec2.SecurityGroup(this, 'ServiceSg', {
            vpc,
            description: 'SFTPGo Fargate service',
        });

        // Allow Fargate → Aurora
        databaseSecurityGroup.addIngressRule(
            serviceSg,
            ec2.Port.tcp(databaseCluster.clusterEndpoint.port),
            'Allow Fargate tasks to reach Aurora',
        );

        // -------------------------------------------------------
        // Fargate Service
        // -------------------------------------------------------
        const service = new ecs.FargateService(this, 'SftpGoService', {
            cluster,
            taskDefinition,
            desiredCount: 1,
            assignPublicIp: true,                       // runs in public subnet
            vpcSubnets: {subnetType: ec2.SubnetType.PUBLIC},
            securityGroups: [serviceSg],
        });

        // -------------------------------------------------------
        // Network Load Balancer with Elastic IPs (stable public IP)
        // -------------------------------------------------------
        const eip1 = new ec2.CfnEIP(this, 'SftpGoEip1');
        const eip2 = new ec2.CfnEIP(this, 'SftpGoEip2');

        const nlb = new elbv2.NetworkLoadBalancer(this, 'SftpGoNlb', {
            vpc,
            internetFacing: true,
            crossZoneEnabled: true,
        });

        // Associate Elastic IPs with the NLB subnets
        const publicSubnets = vpc.selectSubnets({subnetType: ec2.SubnetType.PUBLIC}).subnets;
        const cfnNlb = nlb.node.defaultChild as elbv2.CfnLoadBalancer;
        cfnNlb.addPropertyDeletionOverride('Subnets');
        cfnNlb.subnetMappings = publicSubnets.map((subnet, index) => ({
            subnetId: subnet.subnetId,
            allocationId: index === 0 ? eip1.attrAllocationId : eip2.attrAllocationId,
        }));

        // SFTP listener (port 2022)
        const sftpListener = nlb.addListener('SftpListener', {
            port: 2022,
            protocol: elbv2.Protocol.TCP,
        });
        sftpListener.addTargets('SftpTarget', {
            port: 2022,
            protocol: elbv2.Protocol.TCP,
            targets: [service],
            healthCheck: {
                port: '8080',
                protocol: elbv2.Protocol.HTTP,
                path: '/healthz',
            },
        });

        // Web UI / API listener (port 8080)
        const httpListener = nlb.addListener('HttpListener', {
            port: 8080,
            protocol: elbv2.Protocol.TCP,
        });
        httpListener.addTargets('HttpTarget', {
            port: 8080,
            protocol: elbv2.Protocol.TCP,
            targets: [service],
            healthCheck: {
                port: '8080',
                protocol: elbv2.Protocol.HTTP,
                path: '/healthz',
            },
        });

        // Allow NLB health checks + traffic into the service
        serviceSg.addIngressRule(
            ec2.Peer.anyIpv4(),
            ec2.Port.tcp(2022),
            'Allow SFTP traffic from NLB',
        );
        serviceSg.addIngressRule(
            ec2.Peer.anyIpv4(),
            ec2.Port.tcp(8080),
            'Allow HTTP traffic from NLB',
        );

        // -------------------------------------------------------
        // Outputs
        // -------------------------------------------------------
        new cdk.CfnOutput(this, 'NlbDnsName', {
            value: nlb.loadBalancerDnsName,
            description: 'NLB DNS name for SFTPGo',
        });
        new cdk.CfnOutput(this, 'ElasticIp1', {
            value: eip1.ref,
            description: 'Elastic IP 1 for SFTP connections',
        });
        new cdk.CfnOutput(this, 'ElasticIp2', {
            value: eip2.ref,
            description: 'Elastic IP 2 for SFTP connections',
        });
    }
}
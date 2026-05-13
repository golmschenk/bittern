import * as cdk from 'aws-cdk-lib';
import {Construct} from 'constructs';

import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as sqs from 'aws-cdk-lib/aws-sqs';

export class ContainerStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const inputBucket = new s3.Bucket(this, 'InputBucketContainerStepFunctionExample', {
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        });

        const outputBucket = new s3.Bucket(this, 'OutputBucketContainerStepFunctionExample', {
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        });

        const vpc = new ec2.Vpc(this, 'Vpc', {
            maxAzs: 2,
            natGateways: 1,
        });

        const cluster = new ecs.Cluster(this, 'EcsClusterContainerStepFunctionExample', {vpc});

        const asg = new autoscaling.AutoScalingGroup(this, 'EcsAsg', {
            vpc,
            instanceType: new ec2.InstanceType('t3.small'),
            machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
            minCapacity: 0,
            maxCapacity: 10,
        });

        asg.addUserData(`echo ECS_CLUSTER=${cluster.clusterName} >> /etc/ecs/ecs.config`);

        asg.role.addManagedPolicy(
            iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonEC2ContainerServiceforEC2Role'),
        );

        const capacityProvider = new ecs.AsgCapacityProvider(this, 'EcsAsgCapacityProvider', {
            autoScalingGroup: asg,
            enableManagedScaling: true,
            targetCapacityPercent: 100,
        });
        cluster.addAsgCapacityProvider(capacityProvider);

        const dlq = new sqs.Queue(this, 'JobsDlq', {
            retentionPeriod: cdk.Duration.days(14),
        });

        const jobsQueue = new sqs.Queue(this, 'JobsQueue', {
            visibilityTimeout: cdk.Duration.minutes(5),
            deadLetterQueue: {queue: dlq, maxReceiveCount: 5},
        });

        const taskDefinition = new ecs.Ec2TaskDefinition(this, 'Ec2TaskDefinition');

        inputBucket.grantRead(taskDefinition.taskRole);
        outputBucket.grantReadWrite(taskDefinition.taskRole);
        jobsQueue.grantConsumeMessages(taskDefinition.taskRole);
        taskDefinition.taskRole.addToPrincipalPolicy(
            new iam.PolicyStatement({actions: ['events:PutEvents'], resources: ['*']}),
        );

        const containerRepository = ecr.Repository.fromRepositoryName(
            this,
            'NenaContainerScriptExampleRepo',
            'nena',
        );

        taskDefinition.addContainer('EcsWorker', {
            image: ecs.ContainerImage.fromEcrRepository(containerRepository, 'latest'),
            logging: ecs.LogDrivers.awsLogs({streamPrefix: 'worker'}),
            memoryLimitMiB: 512,
            environment: {
                INPUT_BUCKET: inputBucket.bucketName,
                OUTPUT_BUCKET: outputBucket.bucketName,
                QUEUE_URL: jobsQueue.queueUrl,
                OUTPUT_EVENT_SOURCE: 'nena.container',
                OUTPUT_EVENT_DETAIL_TYPE: 'container.task.completed',
            },
        });

        const service = new ecs.Ec2Service(this, 'WorkerService', {
            cluster,
            taskDefinition,
            desiredCount: 0,
            capacityProviderStrategies: [
                {
                    capacityProvider: capacityProvider.capacityProviderName,
                    weight: 1,
                },
            ],
            enableECSManagedTags: true,
        });

        const scaling = service.autoScaleTaskCount({
            minCapacity: 0,
            maxCapacity: 50,
        });

        scaling.scaleOnMetric('ScaleOnQueueDepth', {
            metric: jobsQueue.metricApproximateNumberOfMessagesVisible(),
            scalingSteps: [
                {upper: 0, change: 0},
                {lower: 1, change: +1},
                {lower: 10, change: +5},
                {lower: 100, change: +20},
            ],
            adjustmentType: autoscaling.AdjustmentType.CHANGE_IN_CAPACITY,
            cooldown: cdk.Duration.seconds(60),
        });

        const triggerRule = new events.Rule(this, 'TriggerRule', {
            eventPattern: {
                source: ['com.olmschenk.nena'],
                detailType: ['input_event'],
            },
        });

        triggerRule.addTarget(
            new targets.SqsQueue(jobsQueue, {
                message: events.RuleTargetInput.fromEventPath('$'),
            }),
        );
    }
}

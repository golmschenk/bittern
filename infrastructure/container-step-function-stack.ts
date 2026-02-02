import * as cdk from 'aws-cdk-lib';
import {Construct} from 'constructs';

import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as ecr from 'aws-cdk-lib/aws-ecr';

export class ContainerStepFunctionStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const inputBucket = new s3.Bucket(this, 'input-bucket-container-step-function-example', {
            encryption: s3.BucketEncryption.S3_MANAGED,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        });

        const outputBucket = new s3.Bucket(this, 'output-bucket-container-step-function-example', {
            encryption: s3.BucketEncryption.S3_MANAGED,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        });

        const vpc = new ec2.Vpc(this, 'vpc', {
            maxAzs: 2,
            natGateways: 1,
        });

        const cluster = new ecs.Cluster(this, 'ecs-cluster-container-step-function-example', {vpc});
        const asg = new autoscaling.AutoScalingGroup(this, 'ecs-asg', {
            vpc,
            instanceType: new ec2.InstanceType('t3.small'),
            machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
            minCapacity: 0,
            maxCapacity: 1,
        });
        const capacityProvider = new ecs.AsgCapacityProvider(this, 'ecs-asg-capacity-provider', {
            autoScalingGroup: asg,
            enableManagedScaling: true,
            targetCapacityPercent: 100,
        });
        cluster.addAsgCapacityProvider(capacityProvider);

        const taskDefinition = new ecs.Ec2TaskDefinition(this, 'ec2-task-definition');
        inputBucket.grantRead(taskDefinition.taskRole);
        outputBucket.grantReadWrite(taskDefinition.taskRole);

        const container_repository = ecr.Repository.fromRepositoryName(
            this,
            'bittern-container-script-example-repo',
            'bittern/bittern-container-script-example',
        );

        const container = taskDefinition.addContainer('ecs-container', {
            image: ecs.ContainerImage.fromEcrRepository(container_repository, 'latest'),
            logging: ecs.LogDrivers.awsLogs({streamPrefix: 'worker'}),
            memoryLimitMiB: 512,
        });

        const runEc2Task = new tasks.EcsRunTask(this, 'run-ec2-task', {
            cluster,
            taskDefinition,
            launchTarget: new tasks.EcsEc2LaunchTarget(),
            integrationPattern: sfn.IntegrationPattern.WAIT_FOR_TASK_TOKEN,
            assignPublicIp: false,
            containerOverrides: [
                {
                    containerDefinition: container,
                    environment: [
                        {
                            name: 'STEP_FUNCTION_TASK_TOKEN',
                            value: sfn.JsonPath.taskToken,
                        },
                        {
                            name: 'INPUT_BUCKET_NAME',
                            value: inputBucket.bucketName,
                        },
                        {
                            name: 'OUTPUT_BUCKET_NAME',
                            value: outputBucket.bucketName,
                        },
                        {
                            name: 'FILE_TO_PROCESS',
                            value: sfn.JsonPath.stringAt('$.detail.input_file'),
                        },
                    ],
                },
            ],
            resultPath: '$.taskResult',
        });

        const publishOutputEvent = new tasks.EventBridgePutEvents(this, 'publish-output-event', {
            entries: [
                {
                    detailType: 'container.task.completed',
                    source: 'bittern.container',
                    detail: sfn.TaskInput.fromObject({
                        message: sfn.JsonPath.stringAt('$.taskResult.message'),
                        executionId: sfn.JsonPath.stringAt('$$.Execution.Id'),
                        executionName: sfn.JsonPath.stringAt('$$.Execution.Name'),
                    }),
                },
            ],
            resultPath: sfn.JsonPath.DISCARD,
        });

        const stepFunctionDefinition = runEc2Task.next(publishOutputEvent);

        const stateMachine = new sfn.StateMachine(this, 'state-machine-container-step-function-example', {
            definitionBody: sfn.DefinitionBody.fromChainable(stepFunctionDefinition),
            timeout: cdk.Duration.minutes(10),
        });
        stateMachine.grantTaskResponse(taskDefinition.taskRole);
        stateMachine.addToRolePolicy(new iam.PolicyStatement({actions: ['events:PutEvents'], resources: ['*']}));

        const triggerRule = new events.Rule(this, 'trigger-rule', {
            eventPattern: {
                source: ['com.olmschenk.bittern'],
                detailType: ['input_event'],
            },
        });
        triggerRule.addTarget(new targets.SfnStateMachine(stateMachine));
    }
}
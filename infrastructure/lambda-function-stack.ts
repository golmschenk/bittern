import * as path from 'path';
import * as cdk from 'aws-cdk-lib/core';
import * as s3 from 'aws-cdk-lib/aws-s3';
import {Construct} from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';

export class LambdaFunctionStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);
        const inputBucket = new s3.Bucket(this, 'input-bucket')
        const outputBucket = new s3.Bucket(this, 'output-bucket')

        const lambdaFunction = new lambda.Function(this, 'example-lambda-function', {
            runtime: lambda.Runtime.PYTHON_3_13,
            handler: 'lambda_function_example.sum_values_in_file',
            code: lambda.Code.fromAsset(path.join(__dirname, '..', 'src')),
            environment: {OUTPUT_BUCKET: outputBucket.bucketName},
        });
        inputBucket.grantRead(lambdaFunction);
        outputBucket.grantWrite(lambdaFunction);

        inputBucket.addEventNotification(
            s3.EventType.OBJECT_CREATED,
            new s3n.LambdaDestination(lambdaFunction),
        );
    }
}

#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import {LambdaFunctionStack} from '../infrastructure/lambda-function-stack';

const app = new cdk.App();
new LambdaFunctionStack(app, 'LambdaFunctionStack', {
    env: {account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION},
});

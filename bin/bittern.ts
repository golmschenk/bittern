#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import {LambdaFunctionStack} from '../infrastructure/lambda-function-stack';
import {ContainerStepFunctionStack} from "../infrastructure/container-step-function-stack";

const app = new cdk.App();
new LambdaFunctionStack(app, 'LambdaFunctionStack', {
    env: {account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION},
});
new ContainerStepFunctionStack(app, 'ContainerStepFunctionStack', {
    env: {account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION},
});

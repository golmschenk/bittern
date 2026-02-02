#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import {LambdaFunctionStack} from '../infrastructure/lambda-function-stack';
import {ContainerStack} from "../infrastructure/container-stack";

const app = new cdk.App();
new LambdaFunctionStack(app, 'LambdaFunctionStack', {
    env: {account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION},
});
new ContainerStack(app, 'ContainerStack', {
    env: {account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION},
});

#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import {LambdaFunctionStack} from '../infrastructure/lambda-function-stack';
import {ContainerStack} from "../infrastructure/container-stack";
import {DatasetHostingStack} from "../infrastructure/dataset-hosting-stack";

const app = new cdk.App();

new LambdaFunctionStack(app, 'lambda-function-stack', {
    env: {account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION},
});

new ContainerStack(app, 'container-stack', {
    env: {account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION},
});

new DatasetHostingStack(app, 'variable-star-dataset-hosting-stack', {
    env: {account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION},
    datasetName: 'variable-star',
    usernamesWithWritePermission: ['arn:aws:iam::376129880223:role/AWSReservedSSO_Project-Power-User_17786188e6b46bb8'],
});


#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import {LambdaFunctionStack} from '../infrastructure/lambda-function-stack';
import {ContainerStack} from "../infrastructure/container-stack";
import {DataHostingStack} from "../infrastructure/data-hosting-stack";
import {getUsernamesAndSshKeysRecord} from "../infrastructure/ssh-users";

const app = new cdk.App();

new LambdaFunctionStack(app, 'lambda-function-stack', {
    env: {account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION},
});

new ContainerStack(app, 'container-stack', {
    env: {account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION},
});

new DataHostingStack(app, 'variable-star-dataset-data-hosting-stack', {
    env: {account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION},
    dataName: 'variable-star-dataset',
    tags: {'working-group': '6', 'deployment-environment': 'production'},
    usernameAndSshKeyRecord: getUsernamesAndSshKeysRecord(['golmschenk'])
});

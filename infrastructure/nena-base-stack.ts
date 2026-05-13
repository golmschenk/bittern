import * as cdk from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {StackProps} from "aws-cdk-lib";

export type NenaBaseStackProps = StackProps & {
    tags: { 'deployment-environment': string, 'working-group': string } & { [key: string]: string };
};

export class NenaBaseStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: NenaBaseStackProps) {
        if ('team' in props.tags) {
            throw new Error(`The \`team\` tag is set automatically and must not be set manually.`)
        }
        props.tags['team'] = 'rges-pit';
        super(scope, id, props);
    }
}

import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import {Construct} from 'constructs';
import {StackProps} from "aws-cdk-lib";

interface DatasetHostingStackProps extends StackProps {
    datasetName: string;
    usernamesWithWritePermission: [string]
}

export class DatasetHostingStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: DatasetHostingStackProps) {
        super(scope, id, props);

        const bucket = new s3.Bucket(this, `${props.datasetName}-dataset-bucket`, {
            bucketName: `${props.datasetName}-dataset`,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS_ONLY,
        });

        bucket.addToResourcePolicy(new iam.PolicyStatement({
            sid: 'PublicReadGetObject',
            effect: iam.Effect.ALLOW,
            principals: [new iam.AnyPrincipal()],
            actions: ['s3:GetObject'],
            resources: [`${bucket.bucketArn}/*`],
        }));

        // for (const usernameWithWritePermission of props.usernamesWithWritePermission)
        // {
        //     const role = iam.Role.fromRoleArn(this,
        //         `${props.datasetName}-dataset-bucket-write-access-role-for-${usernameWithWritePermission}`,
        //         usernameWithWritePermission);
        //     bucket.grantWrite(role);
        // }
    }
}

import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cr from 'aws-cdk-lib/custom-resources';
import {Construct} from 'constructs';
import {BitternBaseStack, BitternBaseStackProps} from './bittern-base-stack';

interface DataHostingStackProps extends BitternBaseStackProps {
    dataName: string;
}

export class DataHostingStack extends BitternBaseStack {
    public readonly bucket: s3.Bucket;

    constructor(scope: Construct, id: string, props: DataHostingStackProps) {
        super(scope, id, props);
        this.bucket = new s3.Bucket(this, `${props.dataName}-bucket`, {
            bucketName: `${props.dataName}`,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS_ONLY,
        });

        new cr.AwsCustomResource(this, 'RequesterPays', {
            onCreate: {
                service: 'S3',
                action: 'putBucketRequestPayment',
                parameters: {
                    Bucket: this.bucket.bucketName,
                    RequestPaymentConfiguration: {Payer: 'Requester'},
                },
                physicalResourceId: cr.PhysicalResourceId.of('RequesterPays'),
            },
            policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
                resources: [this.bucket.bucketArn],
            }),
        });

        this.bucket.addToResourcePolicy(new iam.PolicyStatement({
            sid: 'PublicReadGetObject',
            effect: iam.Effect.ALLOW,
            principals: [new iam.AnyPrincipal()],
            actions: ['s3:GetObject'],
            resources: [`${this.bucket.bucketArn}/*`],
        }));
    }
}
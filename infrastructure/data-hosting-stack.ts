import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
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

        const cfnBucket = this.bucket.node.defaultChild as s3.CfnBucket;
        cfnBucket.addPropertyOverride('RequestPaymentConfiguration', {
            Payer: 'Requester',
        });

        this.bucket.addToResourcePolicy(new iam.PolicyStatement({
            sid: `PublicReadGetObject`,
            effect: iam.Effect.ALLOW,
            principals: [new iam.AnyPrincipal()],
            actions: [`s3:GetObject`],
            resources: [`${this.bucket.bucketArn}/*`],
        }));
    }
}

import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as changeCase from 'change-case';
import {Construct} from 'constructs';
import {BitternBaseStack, BitternBaseStackProps} from './bittern-base-stack';

interface DataHostingStackProps extends BitternBaseStackProps {
    dataName: string;
    readerAccountIds?: string[];
}

export class DataHostingStack extends BitternBaseStack {
    public readonly bucket: s3.Bucket;
    public readonly accessPoint?: s3.CfnAccessPoint;

    constructor(scope: Construct, id: string, props: DataHostingStackProps) {
        super(scope, id, props);

        this.bucket = new s3.Bucket(this, `${changeCase.pascalCase(props.dataName)}Bucket`, {
            bucketName: `${props.dataName}`,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        });

        if (props.readerAccountIds && props.readerAccountIds.length > 0) {
            this.bucket.addToResourcePolicy(new iam.PolicyStatement({
                sid: 'DelegateToAccessPoints',
                effect: iam.Effect.ALLOW,
                principals: [new iam.AnyPrincipal()],
                actions: ['s3:GetObject', 's3:ListBucket'],
                resources: [this.bucket.bucketArn, `${this.bucket.bucketArn}/*`],
                conditions: {
                    StringEquals: {'s3:DataAccessPointAccount': this.account},
                },
            }));

            const accessPointName = `rges-pit-${props.dataName}`;
            const accessPointArn = `arn:aws:s3:${this.region}:${this.account}:accesspoint/${accessPointName}`;
            const readerPrincipals = props.readerAccountIds.map(
                readerAccountId => `arn:aws:iam::${readerAccountId}:root`,
            );

            this.accessPoint = new s3.CfnAccessPoint(this, `${changeCase.pascalCase(props.dataName)}AccessPoint`, {
                bucket: this.bucket.bucketName,
                name: accessPointName,
                publicAccessBlockConfiguration: {
                    blockPublicAcls: true,
                    blockPublicPolicy: true,
                    ignorePublicAcls: true,
                    restrictPublicBuckets: true,
                },
                policy: {
                    Version: '2012-10-17',
                    Statement: [
                        {
                            Sid: 'AllowReaderAccountsRead',
                            Effect: 'Allow',
                            Principal: {AWS: readerPrincipals},
                            Action: ['s3:GetObject', 's3:ListBucket'],
                            Resource: [
                                accessPointArn,
                                `${accessPointArn}/object/*`,
                            ],
                            Condition: {
                                StringEquals: {
                                    'aws:RequestedRegion': this.region,
                                },
                            },
                        },
                    ],
                },
            });
        }
    }
}
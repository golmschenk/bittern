import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as transfer from 'aws-cdk-lib/aws-transfer';
import * as cdk from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {BitternBaseStack, BitternBaseStackProps} from './bittern-base-stack';

interface SftpEndpointStackProps extends BitternBaseStackProps {
    buckets: [s3.Bucket];
    usernameAndSshKeyRecord: Record<string, string>;
}

export class SftpEndpointStack extends BitternBaseStack {
    constructor(scope: Construct, id: string, props: SftpEndpointStackProps) {
        super(scope, id, props);

        const sharedTransferRole = new iam.Role(this, `sftp-server-transfer-role`, {
            assumedBy: new iam.ServicePrincipal(`transfer.amazonaws.com`),
        });

        for (const bucket of props.buckets) {
            bucket.grantReadWrite(sharedTransferRole);

            sharedTransferRole.addToPolicy(new iam.PolicyStatement({
                actions: [`s3:ListBucket`],
                resources: [bucket.bucketArn],
            }));
        }

        const server = new transfer.CfnServer(this, `sftp-server`, {
            identityProviderType: `SERVICE_MANAGED`,
            protocols: [`SFTP`],
            endpointType: `PUBLIC`,
        });

        const customDomain = 'olmschenk.com';
        const customSubdomain = 'sftp.';
        cdk.Tags.of(server).add('transfer:customHostname', customSubdomain + customDomain);

        for (const [username, sshKey] of Object.entries(props.usernameAndSshKeyRecord))
            new transfer.CfnUser(this, `sftp-endpoint-user-${username}`, {
                serverId: server.attrServerId,
                userName: `${username}`,
                role: sharedTransferRole.roleArn,
                homeDirectoryType: 'LOGICAL',
                homeDirectoryMappings: props.buckets.map((bucket) => ({
                    entry: `/${bucket.bucketName}`,
                    target: `/${bucket.bucketName}`,
                })),
                sshPublicKeys: [`${sshKey}`],
            });
    }
}

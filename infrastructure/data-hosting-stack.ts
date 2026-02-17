import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as transfer from 'aws-cdk-lib/aws-transfer';
import {Construct} from 'constructs';
import {BitternBaseStack, BitternBaseStackProps} from './bittern-base-stack';

interface DataHostingStackProps extends BitternBaseStackProps {
    dataName: string;
    usernameAndSshKeyRecord: Record<string, string>;
}

export class DataHostingStack extends BitternBaseStack {
    constructor(scope: Construct, id: string, props: DataHostingStackProps) {
        super(scope, id, props);

        const bucket = new s3.Bucket(this, `${props.dataName}-bucket`, {
            bucketName: `${props.dataName}`,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS_ONLY,

        });

        bucket.addToResourcePolicy(new iam.PolicyStatement({
            sid: `PublicReadGetObject`,
            effect: iam.Effect.ALLOW,
            principals: [new iam.AnyPrincipal()],
            actions: [`s3:GetObject`],
            resources: [`${bucket.bucketArn}/*`],
        }));


    const sharedTransferRole = new iam.Role(this, `${props.dataName}-transfer-role`, {
      assumedBy: new iam.ServicePrincipal(`transfer.amazonaws.com`),
    });
    bucket.grantReadWrite(sharedTransferRole);

    const server = new transfer.CfnServer(this, `${props.dataName}-sftp-server`, {
      identityProviderType: `SERVICE_MANAGED`,
      protocols: [`SFTP`],
      endpointType: `PUBLIC`,
    });

    sharedTransferRole.addToPolicy(new iam.PolicyStatement({
      actions: [`s3:ListBucket`],
      resources: [bucket.bucketArn],
    }));

    for (const [username, sshKey] of Object.entries(props.usernameAndSshKeyRecord))
    new transfer.CfnUser(this, `${props.dataName}-user-${username}`, {
      serverId: server.attrServerId,
      userName: `${username}`,
      role: sharedTransferRole.roleArn,
      homeDirectory: `/${bucket.bucketName}`,
      sshPublicKeys: [`${sshKey}`],
    });
  }
}

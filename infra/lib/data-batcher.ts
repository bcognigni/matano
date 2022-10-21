import * as fs from "fs";
import * as fse from "fs-extra";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { S3BucketWithNotifications } from "./s3-bucket-notifs";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { getLocalAsset, getLocalAssetPath } from "./utils";

interface DataBatcherProps {
  s3Bucket: S3BucketWithNotifications;
}

export class DataBatcher extends Construct {
  outputDLQ: sqs.Queue;
  outputQueue: sqs.Queue;
  constructor(scope: Construct, id: string, props: DataBatcherProps) {
    super(scope, id);

    this.outputDLQ = new sqs.Queue(this, "OutputDLQ");
    this.outputQueue = new sqs.Queue(this, "OutputQueue", {
      deadLetterQueue: { queue: this.outputDLQ, maxReceiveCount: 3 },
    });

    const lambdaFunc = new lambda.Function(this, "Function", {
      code: getLocalAsset("DataBatcherProcessorFunction"),
      handler: "index.handler",
      runtime: lambda.Runtime.NODEJS_16_X,
      timeout: cdk.Duration.seconds(10),
      environment: {
        OUTPUT_QUEUE_URL: this.outputQueue.queueUrl,
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: "1",
      },
    });

    const sqsEventSource = new SqsEventSource(props.s3Bucket.queue, {
      batchSize: 10000,
      maxBatchingWindow: cdk.Duration.seconds(1),
      reportBatchItemFailures: true,
    });
    lambdaFunc.addEventSource(sqsEventSource);
    this.outputQueue.grantSendMessages(lambdaFunc);
  }
}

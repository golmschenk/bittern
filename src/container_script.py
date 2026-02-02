import json
import os
import time
from pathlib import Path

import boto3

s3 = boto3.client("s3")
sqs = boto3.client("sqs")
events = boto3.client("events")

INPUT_BUCKET = os.environ["INPUT_BUCKET"]
OUTPUT_BUCKET = os.environ["OUTPUT_BUCKET"]
QUEUE_URL = os.environ["QUEUE_URL"]
OUTPUT_EVENT_SOURCE = os.environ.get("OUTPUT_EVENT_SOURCE", "bittern.container")
OUTPUT_EVENT_DETAIL_TYPE = os.environ.get("OUTPUT_EVENT_DETAIL_TYPE", "container.task.completed")


def process_file(file_to_process: str) -> dict:
    csv_object = s3.get_object(Bucket=INPUT_BUCKET, Key=file_to_process)
    content = csv_object["Body"].read().decode("utf-8")

    sum_ = sum(map(int, content.split(",")))

    output_object_key = f"{Path(file_to_process).stem}.txt"
    body = f"{sum_}"
    s3.put_object(
        Bucket=OUTPUT_BUCKET,
        Key=output_object_key,
        Body=body.encode("utf-8"),
        ContentType="text/plain; charset=utf-8",
    )
    return {"output_file": output_object_key, "sum": sum_}


def emit_completion_event(input_file: str, result: dict) -> None:
    events.put_events(
        Entries=[
            {
                "Source": OUTPUT_EVENT_SOURCE,
                "DetailType": OUTPUT_EVENT_DETAIL_TYPE,
                "Detail": json.dumps(
                    {
                        "input_file": input_file,
                        "result": result,
                    }
                ),
            }
        ]
    )


def main() -> None:
    while True:
        resp = sqs.receive_message(
            QueueUrl=QUEUE_URL,
            MaxNumberOfMessages=1,
            WaitTimeSeconds=20,
            VisibilityTimeout=300,
        )

        messages = resp.get("Messages", [])
        if not messages:
            continue

        msg = messages[0]
        receipt = msg["ReceiptHandle"]

        try:
            detail = json.loads(msg["Body"])
            payload = detail.get("detail", detail)
            file_to_process = payload["input_file"]
            result = process_file(file_to_process)
            emit_completion_event(file_to_process, result)
            sqs.delete_message(QueueUrl=QUEUE_URL, ReceiptHandle=receipt)
        except Exception:
            time.sleep(1)


if __name__ == "__main__":
    main()
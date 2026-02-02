import json
import os
from pathlib import Path

import boto3

s3 = boto3.client('s3')
INPUT_BUCKET = os.environ['INPUT_BUCKET']
OUTPUT_BUCKET = os.environ['OUTPUT_BUCKET']
FILE_TO_PROCESS = os.environ['FILE_TO_PROCESS']
STEP_FUNCTION_TASK_TOKEN = os.environ['STEP_FUNCTION_TASK_TOKEN']


def sum_values_in_file(event, context):
    csv_object = s3.get_object(Bucket=INPUT_BUCKET, Key=FILE_TO_PROCESS)
    content = csv_object['Body'].read().decode('utf-8')

    sum_ = sum(map(int, content.split(',')))

    output_object_key = f'{Path(FILE_TO_PROCESS).stem}.txt'
    body = f'{sum_}'
    s3.put_object(Bucket=OUTPUT_BUCKET, Key=output_object_key, Body=body.encode('utf-8'),
                  ContentType='text/plain; charset=utf-8')
    client = boto3.client('stepfunctions')
    task_result = {'output_file': output_object_key}
    client.send_task_success(taskToken=STEP_FUNCTION_TASK_TOKEN, output=json.dumps(task_result))

import os
import urllib.parse
from pathlib import Path

import boto3

s3 = boto3.client('s3')
OUTPUT_BUCKET = os.environ['OUTPUT_BUCKET']


def sum_values_in_file(event, context):
    notification = event['Records'][0]['s3']
    bucket_name = notification['bucket']['name']
    input_object_key_encoded = notification['object']['key']
    input_object_key = urllib.parse.unquote_plus(input_object_key_encoded)
    csv_object = s3.get_object(Bucket=bucket_name, Key=input_object_key)
    content = csv_object['Body'].read().decode('utf-8')

    sum_ = sum(map(int, content.split(',')))

    output_object_key = f'{Path(input_object_key).stem}.txt'
    body = f'{sum_}'
    s3.put_object(Bucket=OUTPUT_BUCKET, Key=output_object_key, Body=body.encode('utf-8'),
                  ContentType='text/plain; charset=utf-8')

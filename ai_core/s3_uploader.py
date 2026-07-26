"""
Simple S3 uploader helper for AI core clips.

Usage:
  python s3_uploader.py upload <local_path> --bucket my-bucket --key clips/<filename>
  python s3_uploader.py presign <local_path> --bucket my-bucket --key clips/<filename>

Reads AWS credentials from environment variables:
  AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION

This file is an optional helper and does not change main application logic.
"""
import os
import sys
import argparse
from pathlib import Path

try:
    import boto3
except ImportError:
    boto3 = None


def get_s3_client():
    if boto3 is None:
        raise RuntimeError('boto3 not installed. Install with: pip install boto3')
    sess = boto3.session.Session()
    return sess.client('s3')


def upload(local_path, bucket, key):
    client = get_s3_client()
    local = Path(local_path)
    if not local.exists():
        raise FileNotFoundError(local_path)
    client.upload_file(str(local), bucket, key)
    print(f'Uploaded s3://{bucket}/{key}')


def presign(bucket, key, expires=3600):
    client = get_s3_client()
    url = client.generate_presigned_url('get_object', Params={'Bucket': bucket, 'Key': key}, ExpiresIn=expires)
    print(url)


def main(argv):
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest='cmd')

    up = sub.add_parser('upload')
    up.add_argument('local_path')
    up.add_argument('--bucket', required=True)
    up.add_argument('--key', required=True)

    ps = sub.add_parser('presign')
    ps.add_argument('--bucket', required=True)
    ps.add_argument('--key', required=True)
    ps.add_argument('--expires', type=int, default=3600)

    args = p.parse_args(argv)
    if args.cmd == 'upload':
        upload(args.local_path, args.bucket, args.key)
    elif args.cmd == 'presign':
        presign(args.bucket, args.key, args.expires)
    else:
        p.print_help()


if __name__ == '__main__':
    main(sys.argv[1:])

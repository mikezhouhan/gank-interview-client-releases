#!/usr/bin/env python3
"""将 GitHub release 资产同步到 Cloudflare R2。"""

import argparse
import os
import sys
import tempfile
from pathlib import Path
from typing import Iterable, List

import boto3
from botocore.exceptions import ClientError, EndpointConnectionError
import requests


GITHUB_REPO = "mikezhouhan/gank-interview-client-releases"


def check_env() -> None:
    required = {
        "AWS_ACCESS_KEY_ID": os.getenv("AWS_ACCESS_KEY_ID"),
        "AWS_SECRET_ACCESS_KEY": os.getenv("AWS_SECRET_ACCESS_KEY"),
        "R2_ENDPOINT": os.getenv("R2_ENDPOINT"),
        "R2_BUCKET": os.getenv("R2_BUCKET"),
    }
    missing = [name for name, value in required.items() if not value]
    if missing:
        print(f"✗ 缺少环境变量: {', '.join(missing)}")
        print("请至少设置上述变量后再重试")
        sys.exit(1)


def init_r2_client():
    try:
        session = boto3.session.Session()
        client = session.client(
            "s3",
            endpoint_url=os.getenv("R2_ENDPOINT"),
            aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
            region_name=os.getenv("AWS_DEFAULT_REGION", "us-east-1"),
        )
        client.list_buckets()
        print("✓ R2 客户端初始化成功")
        return client
    except (EndpointConnectionError, ClientError) as exc:
        print(f"✗ 无法连接 R2: {exc}")
        sys.exit(1)


def github_release_assets(version: str) -> List[dict]:
    url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/tags/{version}"
    print(f"获取 GitHub release 信息: {url}")
    response = requests.get(url, timeout=30)
    if response.status_code == 404:
        print("✗ 未找到对应版本的 release")
        sys.exit(1)
    response.raise_for_status()
    assets = response.json().get("assets", [])
    if not assets:
        print("✗ release 中没有可下载的文件")
        sys.exit(1)
    return assets


def download_assets(assets: Iterable[dict], download_dir: Path) -> List[Path]:
    download_dir.mkdir(parents=True, exist_ok=True)
    downloaded: List[Path] = []
    for asset in assets:
        name = asset.get("name")
        url = asset.get("browser_download_url")
        if not name or not url:
            continue
        print(f"下载: {name}")
        with requests.get(url, stream=True, timeout=60) as resp:
            resp.raise_for_status()
            target = download_dir / name
            with open(target, "wb") as handle:
                for chunk in resp.iter_content(chunk_size=8192):
                    handle.write(chunk)
        downloaded.append(target)
        print(f"✓ 下载完成: {name}")
    if not downloaded:
        print("✗ 没有成功下载任何资产")
        sys.exit(1)
    return downloaded


def chunk(items: List[dict], size: int = 1000):
    for index in range(0, len(items), size):
        yield items[index : index + size]


def clear_r2_prefix(client, bucket: str, prefix: str) -> None:
    target_prefix = prefix.rstrip("/") + "/"
    print(f"清理 R2 目录: {target_prefix}")
    paginator = client.get_paginator("list_objects_v2")
    deleted = 0
    for page in paginator.paginate(Bucket=bucket, Prefix=target_prefix):
        objects = page.get("Contents", [])
        if not objects:
            continue
        to_delete = [{"Key": obj["Key"]} for obj in objects]
        for batch in chunk(to_delete, 1000):
            client.delete_objects(Bucket=bucket, Delete={"Objects": batch, "Quiet": True})
            deleted += len(batch)
    print(f"✓ 已删除 {deleted} 个对象")


def upload_files(client, bucket: str, prefix: str, files: Iterable[Path]) -> None:
    base_prefix = prefix.rstrip("/")
    for file_path in files:
        key = f"{base_prefix}/{file_path.name}" if base_prefix else file_path.name
        print(f"上传: {file_path.name} -> {key}")
        client.upload_file(str(file_path), bucket, key)
        print(f"✓ 上传完成: {file_path.name}")


def parse_args():
    parser = argparse.ArgumentParser(description="从 GitHub release 下载文件并上传到 Cloudflare R2")
    parser.add_argument("version", help="GitHub release 版本号 (例如: v1.6.6)")
    parser.add_argument("--folder", default="auto_updater", help="R2 目标前缀 (默认: auto_updater)")
    parser.add_argument("--no-clear", action="store_true", help="不清空远端目录，直接覆盖")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    check_env()
    client = init_r2_client()
    bucket = os.getenv("R2_BUCKET")

    print(f"目标版本: {args.version}")
    print(f"目标前缀: {args.folder}")
    print(f"目标存储桶: {bucket}")

    assets = github_release_assets(args.version)

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        print(f"使用临时目录: {temp_path}")
        files = download_assets(assets, temp_path / "downloads")

        if not args.no_clear:
            clear_r2_prefix(client, bucket, args.folder)
        else:
            print("跳过清理，直接覆盖上传")

        upload_files(client, bucket, args.folder, files)

    print("🎉 已完成从 GitHub 到 Cloudflare R2 的同步")


if __name__ == "__main__":
    main()

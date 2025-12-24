#!/usr/bin/env python3
"""
脚本功能：
1. 从GitHub releases下载文件
2. 上传下载的文件到腾讯云COS（重名文件会被覆盖）
"""

import os
import sys
import requests
import zipfile
import tempfile
import shutil
import argparse
from pathlib import Path
from qcloud_cos import CosConfig
from qcloud_cos import CosS3Client
from qcloud_cos.cos_exception import CosClientError, CosServiceError

# 腾讯云配置
TENCENT_SECRET_ID = os.getenv('TENCENT_SECRET_ID')
TENCENT_SECRET_KEY = os.getenv('TENCENT_SECRET_KEY')
TENCENT_COS_BUCKET = "gankinterview-1300515830"  # 固定的bucket名称
TENCENT_COS_REGION = os.getenv('TENCENT_COS_REGION')

# GitHub配置 (版本号将通过参数传入)
GITHUB_REPO = "mikezhouhan/gank-interview-client-releases"

def check_environment():
    """检查环境变量是否设置"""
    required_vars = [
        'TENCENT_SECRET_ID',
        'TENCENT_SECRET_KEY',
        'TENCENT_COS_REGION'
    ]

    missing_vars = []
    for var in required_vars:
        if not os.getenv(var):
            missing_vars.append(var)

    if missing_vars:
        print(f"错误：缺少环境变量: {', '.join(missing_vars)}")
        print("请设置以下环境变量：")
        print("export TENCENT_SECRET_ID=your_secret_id")
        print("export TENCENT_SECRET_KEY=your_secret_key")
        print("export TENCENT_COS_REGION=your_region")
        print(f"注意：COS存储桶已固定为: {TENCENT_COS_BUCKET}")
        return False

    return True

def init_cos_client():
    """初始化腾讯云COS客户端"""
    try:
        config = CosConfig(
            Region=TENCENT_COS_REGION,
            SecretId=TENCENT_SECRET_ID,
            SecretKey=TENCENT_SECRET_KEY
        )
        client = CosS3Client(config)
        print("✓ 腾讯云COS客户端初始化成功")
        return client
    except Exception as e:
        print(f"✗ 腾讯云COS客户端初始化失败: {e}")
        return None

def download_github_release(temp_dir, version):
    """从GitHub下载release文件"""
    try:
        print(f"正在获取GitHub release信息 (版本: {version})...")

        # 构建API URL
        github_api_url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/tags/{version}"

        # 获取release信息
        response = requests.get(github_api_url)
        response.raise_for_status()
        release_data = response.json()
        
        assets = release_data.get('assets', [])
        if not assets:
            print("✗ 没有找到release文件")
            return None
        
        download_dir = Path(temp_dir) / "downloads"
        download_dir.mkdir(exist_ok=True)
        
        downloaded_files = []
        
        for asset in assets:
            asset_name = asset['name']
            download_url = asset['browser_download_url']
            
            print(f"正在下载: {asset_name}")
            
            # 下载文件
            response = requests.get(download_url, stream=True)
            response.raise_for_status()
            
            file_path = download_dir / asset_name
            with open(file_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            
            downloaded_files.append(file_path)
            print(f"✓ 下载完成: {asset_name}")
        
        return downloaded_files
        
    except Exception as e:
        print(f"✗ 下载GitHub release失败: {e}")
        return None

def clear_cos_folder(cos_client, folder_name):
    """清空腾讯云COS指定文件夹"""
    try:
        print(f"正在清空COS文件夹: {folder_name}")

        # 列出文件夹中的所有对象
        response = cos_client.list_objects(
            Bucket=TENCENT_COS_BUCKET,
            Prefix=folder_name + "/"
        )
        
        if 'Contents' in response:
            # 批量删除对象
            objects_to_delete = []
            for obj in response['Contents']:
                objects_to_delete.append({'Key': obj['Key']})
            
            if objects_to_delete:
                cos_client.delete_objects(
                    Bucket=TENCENT_COS_BUCKET,
                    Delete={
                        'Object': objects_to_delete,
                        'Quiet': 'true'
                    }
                )
                print(f"✓ 已删除 {len(objects_to_delete)} 个文件")
            else:
                print("✓ 文件夹已经是空的")
        else:
            print("✓ 文件夹不存在或已经是空的")
            
    except CosServiceError as e:
        print(f"✗ 清空COS文件夹失败: {e}")
        return False
    except Exception as e:
        print(f"✗ 清空COS文件夹失败: {e}")
        return False
    
    return True

def upload_files_to_cos(cos_client, files, folder_name):
    """上传文件到腾讯云COS"""
    try:
        print("正在上传文件到腾讯云COS...")

        for file_path in files:
            file_name = file_path.name
            cos_key = f"{folder_name}/{file_name}"
            
            print(f"正在上传: {file_name}")
            
            cos_client.upload_file(
                Bucket=TENCENT_COS_BUCKET,
                LocalFilePath=str(file_path),
                Key=cos_key
            )
            
            print(f"✓ 上传完成: {file_name}")
        
        print("✓ 所有文件上传完成")
        return True
        
    except CosServiceError as e:
        print(f"✗ 上传文件到COS失败: {e}")
        return False
    except Exception as e:
        print(f"✗ 上传文件到COS失败: {e}")
        return False

def parse_arguments():
    """解析命令行参数"""
    parser = argparse.ArgumentParser(description='从GitHub下载release文件并上传到腾讯云COS')
    parser.add_argument('version', help='GitHub release版本号 (例如: v1.1.7)')
    parser.add_argument('--folder', default='auto_updater', help='腾讯云COS目标文件夹 (默认: auto_updater)')
    parser.add_argument('--no-clear', action='store_true', help='不清空目标文件夹，直接覆盖上传')
    return parser.parse_args()

def main():
    """主函数"""
    # 解析命令行参数
    args = parse_arguments()

    print(f"开始执行GitHub到腾讯云COS的更新脚本...")
    print(f"目标版本: {args.version}")
    print(f"目标文件夹: {args.folder}")

    # 检查环境变量
    if not check_environment():
        sys.exit(1)
    
    # 初始化COS客户端
    cos_client = init_cos_client()
    if not cos_client:
        sys.exit(1)
    
    # 创建临时目录
    with tempfile.TemporaryDirectory() as temp_dir:
        print(f"使用临时目录: {temp_dir}")

        # 步骤1: 从GitHub下载文件
        print("\n=== 步骤1: 从GitHub下载文件 ===")
        downloaded_files = download_github_release(temp_dir, args.version)
        if not downloaded_files:
            print("✗ 下载失败，退出")
            sys.exit(1)

        # 步骤2: 清空COS目标文件夹（可选）
        if not args.no_clear:
            print(f"\n=== 步骤2: 清空COS目标文件夹 {args.folder} ===")
            if not clear_cos_folder(cos_client, args.folder):
                print("✗ 清空文件夹失败，退出")
                sys.exit(1)
        else:
            print(f"\n=== 步骤2: 跳过清空文件夹，将直接覆盖同名文件 ===")

        # 步骤3: 上传文件到腾讯云COS
        print(f"\n=== 步骤3: 上传文件到腾讯云COS {args.folder} ===")
        if not upload_files_to_cos(cos_client, downloaded_files, args.folder):
            print("✗ 上传文件失败，退出")
            sys.exit(1)
    
    print("\n🎉 所有步骤完成！文件已成功从GitHub更新到腾讯云COS")

if __name__ == "__main__":
    main()

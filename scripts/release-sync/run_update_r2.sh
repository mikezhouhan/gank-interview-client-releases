#!/bin/bash

if [ $# -eq 0 ]; then
    echo "用法: $0 <版本号> [前缀] [--no-clear]"
    echo "示例: $0 v1.6.6"
    echo "示例: $0 v1.6.6 auto_updater"
    echo "示例: $0 v1.6.6 auto_updater --no-clear"
    exit 1
fi

VERSION=$1
PREFIX=${2:-auto_updater}
NO_CLEAR=$3
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "正在安装 Python 依赖..."
pip3 install -r "$SCRIPT_DIR/requirements.txt" --break-system-packages

echo "开始同步 GitHub release 到 Cloudflare R2"
echo "版本: $VERSION"
echo "目标前缀: $PREFIX"
echo "目标存储桶: $R2_BUCKET"

if [ "$NO_CLEAR" = "--no-clear" ]; then
    echo "模式: 不清空远端目录"
    python3 "$SCRIPT_DIR/update_to_r2.py" "$VERSION" --folder "$PREFIX" --no-clear
else
    echo "模式: 清空后上传"
    python3 "$SCRIPT_DIR/update_to_r2.py" "$VERSION" --folder "$PREFIX"
fi

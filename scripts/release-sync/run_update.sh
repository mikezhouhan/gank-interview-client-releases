#!/bin/bash

# 检查参数
if [ $# -eq 0 ]; then
    echo "用法: $0 <版本号> [文件夹名] [--no-clear]"
    echo "例如: $0 v1.1.7"
    echo "例如: $0 v1.1.7 auto_updater"
    echo "例如: $0 v1.1.7 auto_updater --no-clear  # 不清空文件夹，直接覆盖"
    exit 1
fi

VERSION=$1
FOLDER=${2:-auto_updater}
NO_CLEAR=$3
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "正在安装Python依赖..."
pip3 install -r "$SCRIPT_DIR/requirements.txt" --break-system-packages

echo "开始执行更新脚本..."
echo "版本: $VERSION"
echo "目标文件夹: $FOLDER"
echo "目标存储桶: gankinterview-1300515830"

if [ "$NO_CLEAR" = "--no-clear" ]; then
    echo "模式: 不清空文件夹，直接覆盖"
    python3 "$SCRIPT_DIR/update_from_github.py" "$VERSION" --folder "$FOLDER" --no-clear
else
    echo "模式: 清空文件夹后上传"
    python3 "$SCRIPT_DIR/update_from_github.py" "$VERSION" --folder "$FOLDER"
fi

# Release 资产上传脚本

用于把 GitHub Releases 资产同步到腾讯云 COS 或 Cloudflare R2。

## 目录结构

- `run_update.sh` / `update_from_github.py`：GitHub → 腾讯云 COS
- `run_update_r2.sh` / `update_to_r2.py`：GitHub → Cloudflare R2
- `requirements.txt`：Python 依赖

## GitHub → 腾讯云 COS

依赖环境变量：
- `TENCENT_SECRET_ID`
- `TENCENT_SECRET_KEY`
- `TENCENT_COS_REGION`

示例：
```bash
chmod +x run_update.sh

# 清空后上传
./run_update.sh v1.7.5 auto_updater

# 不清空目录，直接覆盖
./run_update.sh v1.7.4 auto_updater --no-clear
./run_update.sh v1.7.5 no_one_auto_updater --no-clear
```

## GitHub → Cloudflare R2

依赖环境变量：
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_DEFAULT_REGION`（可选，默认 `us-east-1`）
- `R2_ENDPOINT`
- `R2_BUCKET`

示例：
```bash
chmod +x run_update_r2.sh

# 清空后上传
./run_update_r2.sh v1.7.5 auto_updater

# 不清空目录，直接覆盖
./run_update_r2.sh v1.0.2 auto_updater --no-clear
./run_update_r2.sh v1.0.3 no_one_auto_updater --no-clear 
```

## 说明

- 默认目标仓库：`mikezhouhan/gank-interview-client-releases`
- 版本号参数为 GitHub Release tag（如 `v1.7.5`）

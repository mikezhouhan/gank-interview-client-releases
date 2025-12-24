gh workflow run release.yml \
      --ref main \
      --field tag=v1.7.4 \
      --field branch=dev

gh workflow run release-no-one.yml \
      --ref main \
      --field tag=v1.7.5 \
      --field branch=dev_one

gh workflow run release.yml \
      --ref main \
      --field tag=v1.0.2 \
      --field branch=dev_en

gh workflow run release-no-one.yml \
      --ref main \
      --field tag=v1.0.3 \
      --field branch=dev_en_one

---

## Release 资产上传脚本

脚本已统一放在 `scripts/release-sync/`：

- 腾讯云 COS：`scripts/release-sync/run_update.sh`
- Cloudflare R2：`scripts/release-sync/run_update_r2.sh`

具体用法见：`scripts/release-sync/README.md`

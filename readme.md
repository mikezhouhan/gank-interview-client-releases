gh workflow run release.yml \
      --ref main \
      --field tag=v2.0.4 \
      --field branch=dev

gh workflow run release-no-one.yml \
      --ref main \
      --field tag=v2.0.5 \
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

## 发布验证

正式发布默认执行精简检查：最终包完整性及字节码加载、原生依赖和基础功能、互联实际通信。签名、公证及发布前检查仍必须通过。

修改 Electron、保护机制或核心业务行为后，可在原工作流勾选 `full_validation`，或在上述命令追加 `--field full_validation=true`，执行完整回归。无需新增工作流。直接在客户端源码运行 `node scripts/test-built-package.cjs` 仍默认执行完整回归；设置 `GANK_PACKAGE_CHECKS=smoke` 可运行精简检查。

## Release 资产上传脚本

脚本已统一放在 `scripts/release-sync/`：

- 腾讯云 COS：`scripts/release-sync/run_update.sh`
- Cloudflare R2：`scripts/release-sync/run_update_r2.sh`

具体用法见：`scripts/release-sync/README.md`

# 发布仓库候选包验证

`Validate client packages (no release)` 在本发布仓库运行。推送 `codex/release-validation-*` 分支会启动；客户端源码固定为工作流中的完整提交 SHA，也可以在手动运行时指定完整 SHA。

与正式发布命令一致，各次运行独立提交，六组构建采用并行矩阵，不设置同分支串行锁或 `max-parallel` 限制。实际开跑时间仍取决于 GitHub runner 的可用容量；新的候选运行不会自动取消旧构建。

六个任务分别构建 GankInterview／Desktophelper 的 macOS ARM64、macOS Intel 与 Windows x64。与正式发布 #644 对齐，runner 分别为 `macos-latest`、`macos-15-intel`、`windows-2022`；#644 的 ARM64 实际镜像是 macOS 26.6.2，`macos-latest` 的具体镜像版本以每次运行日志为准。沿用发布的 Node 23、渠道名称／图标及 `package-mac`、`package-win --publish=never` 命令，Mac 生成 DMG 和 ZIP，Windows 生成 NSIS。Rust 固定 1.86，Windows 安装 .NET 8 编译辅助程序。

验证在独立检出中使用候选源码的原版本号，两种产品共享这份候选版本；这不是正式渠道版本变更。每个任务生成独立的临时 Ed25519 更新签名身份，替换测试检出的公钥；密钥不写入代码、日志或上传资产，任务结束删除。Mac 不使用正式证书或公证，下载地址指向 `validation.invalid`。不创建 Release，不上传安装包，不执行安装器，不写入 main、dev 或 dev_one。

检查包括实际包的名称、版本、原生架构、辅助资源签名与归属、ASAR 内外文件边界、原生模块及沙箱桥接、10 轮互联关闭、实际安装包和更新清单签名。共用检查来自同一份客户端提交；发布脚本只负责构建环境和结果汇总。Actions 仅上传 `report.json`，包括提交、平台、检查状态、产物字节数及摘要。

通过此流程只能证明候选的打包和离线加载；不能替代正式平台签名／公证、定制 Electron 可信加载、升级安装或真实设备测试。正在单独编译的定制 Electron 尚未作为此流程输入。两个正式发布工作流保持独立，避免测试任务误发布。

# 变更记录

## Unreleased

## 0.3.1 — 2026-10-20

- Fix runtime extraction in non-ASCII paths on Windows installations using a different system code page.
- Extract the checksum-verified bridge directly in Rust.
- Keep grammar source checkouts out of local installations.
- Shorten both READMEs to installation and usage.

## 0.3.0 — 2026-10-20

- First-launch installation through Zed's extension API, with a separately versioned bridge archive.
- SHA-256 verification and 26 real checks before first runtime activation.
- Background discovery queues updates for download and validation at the next language-server start.
- Explicit pinned TypeScript and Vue grammars, compiled from source.
- English installation, configuration, maintenance, and publishing documentation; Chinese README retained.
- Clear Windows host support and installer failure messages.

## 0.2.0 — 2026-10-20

- 在 Zed 使用期间每天后台检查官方稳定版，独立下载并校验 SHA-256。
- 候选版本通过 26 项真实语言服务测试后，原子更新默认运行时；
  新版在下次启动语言服务时使用，当前会话保持原进程。
- 保留旧运行时、测试报告和失败日志；增加状态、立即检查、回退、暂停和恢复命令。
- 回退后暂停自动升级；显式 runtimePath 的工作区不参与自动管理。
- 插件嵌入更新器与固定测试样例，重新安装保留已选版本及历史。
- 增加更新事务测试与真实 VSIX 安装/失败拒绝/回退演练，并接入 CI。
- 建立 GitHub 远端仓库，补充源码克隆入口和扩展的仓库地址。

## 0.1.0 — 2026-10-20

- 将原型纳入独立 Git 仓库，以 `v0.1.0` 保存通过统一检查的项目基线。
- 增加统一检查脚本：JavaScript/PowerShell 语法、版本一致性、Rust 格式、
  WASM 构建及真实 DCloud 集成检查。
- 增加 Windows / Node 24 的 GitHub Actions 配置。
- 增加开发说明、维护约定、路线图和源码换行/格式配置。
- 将固定测试夹具与可编辑的演示项目分离，避免手动试用后回归检查失效；
  测试启动前检查预置类型错误是否仍在。

- 通过本地 Node LSP 桥接，接入 DCloud 4.87.0 tsserver 与 indexservice。
- 提供 UTS、UVUE 普通 script、UVUE script setup 的补全、详情、定义、
  悬停和类型诊断。
- 增加 script setup 诊断的版本限定内存补丁。
- 处理快速文档更新、增量编辑、CRLF 与 UTF-16 列位置。
- 通过 26 项集成检查；在 Windows Zed 1.24.3 中验证 UTS 和
  UVUE script setup 的补全菜单、F12 和类型红线。

详细范围和已知限制见 [VALIDATION.md](VALIDATION.md)。

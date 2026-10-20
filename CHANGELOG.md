# 变更记录

## Unreleased

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

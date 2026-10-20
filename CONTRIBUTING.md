# 开发与维护

本仓库维护 Zed 接入层和 LSP 桥接，语义能力复用 DCloud 官方本地语言服务。
当前基线为 `v0.1.0`；还处于原型阶段。功能计划见 [ROADMAP.md](ROADMAP.md)，
历史变化见 [CHANGELOG.md](CHANGELOG.md)。

## 环境与日常流程

当前支持 Windows。开发检查建议使用 Node.js 24，安装 Rust/rustup、Git 和
Windows 自带的 `tar`。`rust-toolchain.toml` 声明 stable 工具链、
rustfmt 和 `wasm32-wasip2` 目标；Cargo 依赖由 `Cargo.lock` 锁定。
0.1.0 实测工具链是 Rust 1.98.1；stable 会随时间更新，构建失败时先记录实际版本。

本仓库没有额外 npm 依赖，无需 `npm install`。

```powershell
# 首次准备官方运行时，不安装或覆盖 Zed 扩展
.\scripts\setup.ps1

# 统一验证入口：语法、版本一致性、Rust 格式、WASM 构建、真实 LSP 集成检查
.\scripts\check.ps1

# 验证通过后，在自己的 Zed 中安装测试
.\scripts\setup.ps1 -Install
```

运行时默认读取安装脚本写出的本地路径，也可以显式传入：

```powershell
.\scripts\check.ps1 -RuntimePath 'D:\tools\dcloud-4.87.0\extension'
.\scripts\check.ps1 -StaticOnly
```

`-StaticOnly` 不执行构建或集成检查，不能作为行为修改的完整验收。
`-NodeCommand` 可以指定 Node 可执行文件，`-BuildDirectory` 和
`-TestDirectory` 可以指定构建缓存与测试输出目录。
集成报告在 `test-results/run-*/report.json`；这些文件和日志不入 Git。

修改 `server/*.cjs` 后必须重建 WASM，因为 Rust 用 `include_str!` 嵌入脚本。
覆盖安装后，在 Zed 命令面板执行 `editor: restart language server`。
更改语法配置或启动流程时，需另外实际验证语法高亮、补全菜单、F12、
错误红线及未保存修改后的清错。协议测试无法替代这一步。

## 代码入口

| 路径 | 职责 |
| --- | --- |
| `src/lib.rs` | Zed 扩展入口、脚本释放、Node 启动与设置透传 |
| `server/server.cjs` | LSP 请求、文档同步、完成项和诊断转换 |
| `server/ts-client.cjs` | DCloud tsserver 子进程、请求队列、事件与生命周期 |
| `server/dcloud-compat.cjs` | 4.87.0 的 script setup 诊断兼容补丁 |
| `languages/` | UTS/UVUE 语言配置与 Tree-sitter 查询 |
| `scripts/` | 构建、运行时准备、安装与统一检查 |
| `test/integration.cjs` | 启动真实官方运行时的集成检查 |
| `test/fixtures/demo/` | 固定测试夹具，保留诊断用的类型错误 |
| `examples/demo/` | 可以自由编辑的最小演示项目 |

修复缺陷时先保留可复现的最小项目，再补能覆盖该缺陷的集成用例。
测试夹具中的类型错误是有意保留的，不应直接修正。
测试不读取 `examples/demo`，所以手动试用时的修改不会改变测试输入。
尽量按一个问题一个提交组织变更，并在 [CHANGELOG.md](CHANGELOG.md) 记录用户可见变化。

## 升级 DCloud 运行时

当前锁定 `dcloud-ide.hbuilderx-language-services 4.87.0`。不要只改下载 URL。

1. 从官方发布渠道取得新 VSIX，记录版本、SHA-256、来源与许可证。
2. 检查 tsserver、dcloudio 插件、indexservice 入口和初始化配置是否变化。
3. 检查 `dcloud-compat.cjs` 针对的 `sourceFile.js` 表达式及诊断行为。
   若上游已修复，移除该内存替换；若仍需适配，保持明确的版本和匹配限制。
4. 搜索旧版本号，核对 Rust 默认目录、服务端检查、安装/验证脚本、测试、
   README 和第三方声明。历史验证记录保留原版本号，不作全局替换。
5. 在独立的 `-ZedDataDirectory` 中准备运行时，完整运行集成检查，
   再在 Zed 中检查 UTS、普通 UVUE、script setup 的补全、跳转和类型检查。
6. 按实际验证范围更新兼容性说明，并记录未覆盖的平台和能力。

运行时只在本地单独下载，不提交到仓库或复制进源码包。
Tree-sitter/Vue 语法来源及 Zed Vue 预编译模块的校验值在
`scripts/build.ps1` 和 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)；
更新时也要复核查询节点、来源与许可证。

## CI 与版本

`.github/workflows/ci.yml` 在 Windows + Node 24 下准备隔离运行时，
执行同一个 `scripts/check.ps1` 并保存报告。
只有仓库推送到启用 GitHub Actions 的远端后，工作流才会运行。
本地通过不代表远端 CI 已通过，也不代表做过新一轮 Zed 界面验收。

版本号需同步更新 `extension.toml`、`Cargo.toml`、`package.json`，
以及服务端对外报告的版本和 Cargo.lock。
先完成检查及必要的 Zed 验证，再更新变更日志、提交并打版本标签。
`v0.1.0` 是通过本轮统一检查的项目基线。后续修改先记录在 Unreleased。
`VALIDATION.md` 与 `verification.json` 保留原型的界面验收快照，
其中二进制哈希属于当时的构建；新的构建验证记录放在 `docs/validation/`。

二进制 `extension.wasm` 和 `grammars/vue.wasm` 不进 Git；
从干净检出构建时，脚本会准备这两个文件。
将来发布到扩展市场前，还需确认仓库地址、作者信息、运行时安装体验
和各平台支持范围。当前仓库没有自动发布流程。

## 问题记录

记录 Zed、插件、Node、DCloud 版本和目标平台，附上最小重现步骤，
注明是 `.uts`、普通 `<script>` 还是 `<script setup>`。
日志可能包含本机路径和源代码，分享前去掉与重现无关的内容。

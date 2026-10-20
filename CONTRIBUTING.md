# 开发与维护

本仓库维护 Zed 接入层和 LSP 桥接，语义能力复用 DCloud 官方本地语言服务。
历史基线为 `v0.1.0`，当前开发版本为 `0.2.0`；还处于原型阶段。功能计划见 [ROADMAP.md](ROADMAP.md)，
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

修改 `server/`、`test/integration.cjs` 或 `test/fixtures/demo/` 后必须重建 WASM，
因为 Rust 用 `include_str!` 嵌入启动文件及本机自动升级所需的测试。
新增运行文件或样例后同步检查 `src/lib.rs` 中的资源列表。
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
| `server/runtime-policy.json` | 官方发布渠道、首次安装版本、固定哈希与检查间隔 |
| `server/runtime-store.cjs` | 原子版本记录、迁移、并发锁、历史选择 |
| `server/runtime-update.cjs` | 官方包下载、校验、独立测试、切换及回退 |
| `server/launch.cjs` / `auto-update.cjs` | 从生效记录启动服务，以及后台到期检查 |
| `languages/` | UTS/UVUE 语言配置与 Tree-sitter 查询 |
| `scripts/` | 构建、运行时准备、安装与统一检查 |
| `test/integration.cjs` | 启动真实官方运行时的集成检查 |
| `test/runtime-update.test.cjs` | 更新事务与失败分支测试；这里的空运行时夹具不代表语义测试 |
| `test/update-lifecycle.cjs` | 真实 VSIX 安装、测试门槛、回退和管理启动入口演练 |
| `test/fixtures/demo/` | 固定测试夹具，保留诊断用的类型错误 |
| `examples/demo/` | 可以自由编辑的最小演示项目 |

修复缺陷时先保留可复现的最小项目，再补能覆盖该缺陷的集成用例。
测试夹具中的类型错误是有意保留的，不应直接修正。
测试不读取 `examples/demo`，所以手动试用时的修改不会改变测试输入。
尽量按一个问题一个提交组织变更，并在 [CHANGELOG.md](CHANGELOG.md) 记录用户可见变化。

## 升级 DCloud 运行时

首次安装使用 `server/runtime-policy.json` 中的 `4.87.0` 基线。
常规官方稳定版由本机管理器自动发现，并通过真实测试后切换；每个候选的
来源、哈希、测试报告和切换前后状态保存在独立目录。
官方内部结构变化导致测试失败时，再进行人工适配：

1. 从官方发布渠道取得新 VSIX，记录版本、SHA-256、来源与许可证。
2. 检查 tsserver、dcloudio 插件、indexservice 入口和初始化配置是否变化。
3. 检查 `dcloud-compat.cjs` 针对的 `sourceFile.js` 表达式及诊断行为。
   只有唯一匹配旧表达式时才替换；4.87.0 不匹配视为错误，新版不匹配时
   原样运行，并必须通过 setup 诊断测试。不要对未知压缩代码做宽泛替换。
4. 需要提升首次安装基线时，更新 `runtime-policy.json`、README 和第三方声明，
   并复核 `initialState` 的迁移约束。历史验证记录保留原版本号，不作全局替换。
5. 在独立的 `-ZedDataDirectory` 中准备运行时，完整运行集成检查，
   再在 Zed 中检查 UTS、普通 UVUE、script setup 的补全、跳转和类型检查。
6. 按实际验证范围更新兼容性说明，并记录未覆盖的平台和能力。

完整更新演练（不会改变日常使用的安装目录）：

```powershell
node test/update-lifecycle.cjs --runtime 'D:\tools\dcloud-4.87.0\extension' --work test-results
```

它重新验证同一个官方版本，演练切换到新目录、真实服务故障的拒绝、
回退、暂停/恢复，以及回退后通过管理启动入口运行 26 项检查。
可传 `--vsix` 复用已下载包；仍核对官方注册表的 SHA-256。
不能把同版本演练写成已经验证了尚未发布的官方新版。

`runtime-state.json` 是唯一生效记录；不要依赖旧 `runtime-path.txt`。
发布新桥接版本时递增插件版本，以便嵌入的运行文件位于新的 `bridge-*`
目录，不覆盖旧会话仍在使用的脚本。下载、解压、测试失败均不得切换 active；
回退必须默认暂停自动更新。不要添加跳过校验或跳过测试的自动更新通道。

运行时只在本地单独下载，不提交到仓库或复制进源码包。
Tree-sitter/Vue 语法来源及 Zed Vue 预编译模块的校验值在
`scripts/build.ps1` 和 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)；
更新时也要复核查询节点、来源与许可证。

## CI 与版本

`.github/workflows/ci.yml` 在 Windows + Node 24 下准备隔离运行时，
执行同一个 `scripts/check.ps1`，然后演练真实更新/回退流程并保存报告。
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

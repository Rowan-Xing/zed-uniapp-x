# uni-app x for Zed

**DCloud 官方 uni-app x 语言服务的第三方 Zed 适配移植版。**

为 `.uts` 和 `.uvue` 接入 DCloud 官方本地语言服务，提供代码补全、
补全文档、跳转定义、悬停类型和类型错误诊断。
核心语义能力直接复用 DCloud 发布的本地 JavaScript 运行时；本项目维护
Rust 扩展入口、协议桥接、兼容适配和经测试的运行时更新。
本项目由 Rowan-Xing 独立维护，不是 DCloud 或 Zed 官方发布的扩展。
这是独立维护的 Zed 插件项目，目前版本为 **0.2.0 原型**，
尚未发布到 Zed 扩展市场。

源码仓库：[Rowan-Xing/zed-uniapp-x](https://github.com/Rowan-Xing/zed-uniapp-x)。

维护入口：[开发说明](CONTRIBUTING.md) · [路线图](ROADMAP.md) ·
[变更记录](CHANGELOG.md) · [插件库发布说明](docs/PUBLISHING.md)。
`v0.1.0` 标签保存项目基线。

2026-10-20：已在 Windows 的 Zed 1.24.3 中安装并验证 UTS、UVUE
`<script setup>` 的补全菜单、跨文件 F12 跳转和未保存修改后的类型错误更新。
26 项协议集成检查全部通过；详细范围见 `VALIDATION.md` 和 `verification.json`。
本次项目化后的构建与复跑记录见
[维护验证记录](docs/validation/2026-10-20-project.md)。
0.2.0 的更新、回退与本次界面检查范围见
[运行时更新验证](docs/validation/2026-10-20-runtime-updates.md)。

## 原理

```text
Zed → Rust/WASM 扩展 → 本地 Node LSP 桥接
                           ├─ DCloud tsserver + dcloudio 插件
                           └─ DCloud indexservice
```

后两者来自官方 VSCode 扩展 `dcloud-ide.hbuilderx-language-services`。
首次安装使用已验证的 `4.87.0`，后续版本须通过本机回归检查才会启用。
语义分析和 `uni.*` 类型定义复用官方实现；本项目处理 Zed 接入、LSP
消息转换和文档同步。编辑时的这些功能在本机进程间通信。
安装和更新从 Open VSX 下载运行时；没有云端代理，也不需要官方服务账号。
Zed 可能自行下载 Node.js。

## Windows 安装

发布目录已包含编译好的 `extension.wasm` 和 Vue 语法模块；UTS 使用 Zed 内置语法。
若从 Git 检出源码，请先按下方“修改与构建”执行构建，再安装。
在本目录打开 PowerShell：

```powershell
.\scripts\setup.ps1 -Install
```

脚本校验官方 VSIX 的 SHA-256，将运行时放入
`%LOCALAPPDATA%\Zed\extensions\work\uniapp-x\dcloud-4.87.0\extension`，
将原型放入 `%LOCALAPPDATA%\Zed\extensions\installed\uniapp-x`。
随后重新打开 Zed，或在命令面板执行重新加载扩展。
安装脚本不修改全局 Zed settings.json。
覆盖安装更新后，已打开的文件可能还需要执行
`editor: restart language server`；本次界面验证中遇到了这种情况。

也可以指定已有的官方 4.87.0 **解压目录**，避免下载：

```powershell
.\scripts\setup.ps1 -Install -RuntimePath 'D:\tools\dcloud-4.87.0\extension'
```

或使用本地 VSIX：`.\scripts\setup.ps1 -Install -VsixPath 'D:\downloads\dcloud.vsix'`。

## 自动更新与回退

默认启用。打开 UTS/UVUE、语言服务启动后，在后台检查官方 Open VSX
稳定版；使用期间每小时查看是否到期，**同一台机器的此安装目录每 24 小时
最多查询一次**。关闭 Zed 时不检查，也不创建 Windows 定时任务。

发现新版后自动执行：

1. 下载独立的 VSIX，核对官方注册表提供的 SHA-256、发布者和版本。
2. 解压到新的版本目录，保留原运行时。
3. 使用随插件附带的固定样例，运行 **26 项真实语言服务检查**。
4. 全部通过才原子切换默认运行时；失败继续使用旧版，保存原因与测试报告。

成功时 Zed 会提示新版已就绪。**当前编辑会话继续使用原进程，新版在下次
语言服务启动时生效**；可执行 `editor: restart language server` 立即启用。
测试在独立样例上运行，不读取或修改你的项目，不向服务器上传项目代码。
这些检查覆盖当前 Android 样例，并不代表全部平台和大型项目均已验证。

手动管理，在项目目录的 PowerShell 中运行：

```powershell
.\scripts\runtime.ps1                         # 当前版本、历史和上次检查结果
.\scripts\runtime.ps1 -Action check           # 立即查询官方版本并验证候选
.\scripts\runtime.ps1 -Action rollback        # 回到前一版，并暂停自动更新
.\scripts\runtime.ps1 -Action resume          # 恢复自动更新
.\scripts\runtime.ps1 -Action pause           # 暂停自动更新
```

回退保留两个版本；回退后同样需要重启语言服务。可用 `-Version 4.87.0`
选择历史中的指定版本。`check -Revalidate -Version 4.87.0` 可重新下载并验证
同一版本，但不会自动降级；降级使用 `rollback`。离线已有 VSIX 可传
`-VsixPath`，仍需联网核对官方版本元数据和哈希。

状态、下载包与报告保存在
`%LOCALAPPDATA%\Zed\extensions\work\uniapp-x`：
`runtime-state.json` 是唯一生效的版本记录，`runtime-releases` 保留候选包、
已验证版本和失败日志。`runtime-path.txt` 仅用于迁移 0.1.0 安装。
重新运行 `setup.ps1 -Install` 会保留已选版本、回退历史和暂停设置。
目前不自动清理旧版本与失败下载，可在确认不再需要后手动清理。

下载失败下次到期会重试；同一个候选版本的语义测试失败后，后台会等包内容
或桥接代码发生变化再重测，手动 `check` 可立即重试。
在工作区的 `initialization_options` 设置 `autoUpdate: false` 可关闭该工作区
的后台检查；`runtimePath` 显式指定的外部运行时不会被管理器接管。
全局暂停请使用上面的 `pause` 命令。

## 试用

用 Zed 打开整个 `examples/demo` 目录，再打开 `sample.uts`、
`pages/index/index.uvue` 或 `pages/options/options.uvue`：

1. 在 `uni.` 后触发补全，可以看到官方 API，例如 `request`。
2. 在 `greet("Zed")` 中的 `greet` 上按 F12，应跳到 `utils/greet.uts`。
3. 将 `const count` 的赋值改为 `number = "wrong"`，应显示类型错误。
   再将 `"wrong"` 改为 `42`，无需保存就会更新诊断。
4. 在 `uni.request` 的 `request` 上跳转，会打开官方 `.d.ts` 定义。

若 Ctrl+Space 被输入法拦截，可在命令面板执行
`editor: show completions`。本次 Windows 界面验证使用了这个命令。

真实项目需要打开包含 `manifest.json`、`pages.json` 的项目目录；
`manifest.json` 应有 `"uni-app-x": {}`。CLI 的 `src` 布局有根目录识别，
但这次主要验证 HBuilderX 项目布局。

默认使用项目 `platformConfig.json` 的目标平台。演示项目固定为 Android。
可在项目 `.zed/settings.json` 显式设置：

```json
{
  "lsp": {
    "uniapp-x": {
      "initialization_options": {
        "targets": ["APP-ANDROID"],
        "locale": "en"
      }
    }
  }
}
```

可选的 `runtimePath` 是官方扩展解压目录的绝对路径。
设置 `diagnostics: false` 可以关闭此服务的诊断。
修改运行时或目标平台设置后重启语言服务最可靠。

## 验证

测试直接启动这里的 LSP 桥接，并调用真正的 DCloud 服务，没有模拟补全或诊断。

日常开发使用统一入口；它会检查脚本语法、版本一致性与 Rust 格式，
构建 WASM，然后运行更新流程测试和全部集成检查：

```powershell
.\scripts\check.ps1
```

也可以单独运行集成检查：

```powershell
node .\test\integration.cjs `
  --runtime "$env:LOCALAPPDATA\Zed\extensions\work\uniapp-x\dcloud-4.87.0\extension" `
  --work '.\.cache\tests'
```

覆盖 UTS、普通 UVUE 和 `<script setup lang="uts">` 的 API 补全、
补全详情、跨文件跳转、官方 API 跳转、悬停、类型诊断、未保存修改；
另有启动期间快速更新、CRLF、emoji/UTF-16 列位置和增量编辑测试。
测试从 `test/fixtures/demo` 复制固定样例到独立目录；
可以自由修改 `examples/demo` 试用插件，不会影响回归检查。

## 已知边界

- 首次安装基线是 **4.87.0**，后续版本通过本机检查后才启用；
  官方内部协议不兼容时，仍需维护者修复桥接代码。
- 这次验证目标为 **APP-ANDROID**，其他平台尚未完成验证。
- `<script setup>` 诊断需要 `server/dcloud-compat.cjs` 的内存补丁。
  它只在指定文件唯一匹配已知表达式时替换，不写回官方文件。
  4.87.0 必须匹配；新版遇到陌生表达式时不修改，交由回归检查验证是否可用。
- 语法高亮使用 TypeScript/Vue Tree-sitter 语法，UTS 特有语法的高亮可能不完整。
- 模板标签、CSS、平台原生类型、复杂泛型、组件重构等未做完整覆盖。
- 没有接入 HBuilderX 的运行、真机调试、编译打包、重命名或代码修复。
- 当前实现每个 Zed 工作区启动一个桥接、一个官方语义服务和一个索引服务。
  大型项目性能、复杂多根工作区和长时间稳定性尚需实测。
- Windows 是这次构建和验证的平台，安装脚本只支持 Windows。

## 修改与构建

取得源码：

```powershell
git clone https://github.com/Rowan-Xing/zed-uniapp-x.git
cd zed-uniapp-x
```

改动 `server/`、集成测试或固定样例后也要重新编译 Rust：
这些文件通过 `include_str!` 嵌入 WASM，启动时写入扩展工作目录的版本子目录。

安装 Rust 的 `wasm32-wasip2` 目标即可重新编译桥接。
构建脚本复用随包附带的 Vue 语法模块；缺失时会下载 Zed 官方 Vue 0.4.1
扩展并校验包哈希，然后提取该语法模块。

```powershell
rustup target add wasm32-wasip2
.\scripts\build.ps1
.\scripts\setup.ps1 -Install
```

也可使用 Zed 的开发扩展安装流程，让 Zed 下载语法并编译；
此方式需要 Rust 和可正常访问 GitHub 的网络。
要自行编译 Vue 语法，可给 `build.ps1` 传入 `-WasiSdkPath` 和
`-VueGrammarPath`，后者需检出 `7e48557b903a9db9c38cea3b7839ef7e1f36c693`。
协议错误可通过 Zed 的 language server logs 查看。
命令行测试设置 `UNIAPP_X_TRACE` 可写本地 JSONL 调试日志，
其内容含项目文件路径，请按需使用。

第三方组件及兼容改动见 `THIRD_PARTY_NOTICES.md`。
官方文档：[DCloud 语言服务插件](https://doc.dcloud.net.cn/uni-app-x/tutorial/ls-plugin.html)、
[Zed 语言扩展](https://zed.dev/docs/extensions/languages)。

## 与 Vue 扩展的关系

Zed 的普通 `.vue` 支持通过 [官方 Vue 扩展](https://github.com/zed-extensions/vue)
提供，作者为 Zed Industries，语言服务来自 Vue language-tools（Volar）。
使用普通 Vue 项目时，在 Zed 扩展页搜索并安装 **Vue** 即可；
项目需有 TypeScript SDK，具体配置见 [Zed Vue 文档](https://zed.dev/docs/languages/vue)。

本项目注册 `.uvue` 和 `.uts`，复用 DCloud 的 uni-app x 语义与平台类型。
普通 Vue 扩展不能替代这里的 DCloud 语言服务。两者的同时安装验证列在路线图中。

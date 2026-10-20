# uni-app x · Zed 本地插件原型

为 `.uts` 和 `.uvue` 接入 DCloud 官方本地语言服务，提供代码补全、
补全文档、跳转定义、悬停类型和类型错误诊断。
这是独立原型，尚未发布到 Zed 扩展市场。

2026-10-20：已在 Windows 的 Zed 1.24.3 中安装并验证 UTS、UVUE
`<script setup>` 的补全菜单、跨文件 F12 跳转和未保存修改后的类型错误更新。
26 项协议集成检查全部通过；详细范围见 `VALIDATION.md` 和 `verification.json`。

## 原理

```text
Zed → Rust/WASM 扩展 → 本地 Node LSP 桥接
                           ├─ DCloud tsserver + dcloudio 插件
                           └─ DCloud indexservice
```

后两者来自官方 VSCode 扩展 `dcloud-ide.hbuilderx-language-services 4.87.0`。
语义分析和 `uni.*` 类型定义复用官方实现；本项目处理 Zed 接入、LSP
消息转换和文档同步。编辑时的这些功能在本机进程间通信。
首次安装从 Open VSX 下载运行时；没有云端代理，也不需要官方服务账号。
Zed 可能自行下载 Node.js。

## Windows 安装

发布目录已包含编译好的 `extension.wasm` 和 Vue 语法模块；UTS 使用 Zed 内置语法。
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

## 试用

用 Zed 打开整个 `examples/demo` 目录，再打开 `sample.uts`、
`pages/index/index.uvue` 或 `pages/options/options.uvue`：

1. 在 `uni.` 后触发补全，可以看到官方 API，例如 `request`。
2. 在 `greet("Zed")` 中的 `greet` 上按 F12，应跳到 `utils/greet.uts`。
3. `const count: number = "wrong"` 故意保留了类型错误。
   将 `"wrong"` 改为 `42`，无需保存就会更新诊断。
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

```powershell
node .\test\integration.cjs `
  --runtime "$env:LOCALAPPDATA\Zed\extensions\work\uniapp-x\dcloud-4.87.0\extension" `
  --work '.\.cache\tests'
```

覆盖 UTS、普通 UVUE 和 `<script setup lang="uts">` 的 API 补全、
补全详情、跨文件跳转、官方 API 跳转、悬停、类型诊断、未保存修改；
另有启动期间快速更新、CRLF、emoji/UTF-16 列位置和增量编辑测试。
测试会复制示例到独立目录，不改动演示源文件。

## 已知边界

- 固定依赖官方 **4.87.0**，升级需重新验证协议和兼容补丁。
- 这次验证目标为 **APP-ANDROID**，其他平台尚未完成验证。
- `<script setup>` 诊断需要 `server/dcloud-compat.cjs` 的内存补丁。
  它只对指定文件替换一个已知表达式，匹配失败就报错；不写回官方文件。
- 语法高亮使用 TypeScript/Vue Tree-sitter 语法，UTS 特有语法的高亮可能不完整。
- 模板标签、CSS、平台原生类型、复杂泛型、组件重构等未做完整覆盖。
- 没有接入 HBuilderX 的运行、真机调试、编译打包、重命名或代码修复。
- 当前实现每个 Zed 工作区启动一个桥接、一个官方语义服务和一个索引服务。
  大型项目性能、复杂多根工作区和长时间稳定性尚需实测。
- Windows 是这次构建和验证的平台，安装脚本只支持 Windows。

## 修改与构建

改动 `server/*.cjs` 后也要重新编译 Rust：
这些文件通过 `include_str!` 嵌入 WASM，启动时写入扩展工作目录。

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

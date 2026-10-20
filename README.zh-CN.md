# uni-app x for Zed

**DCloud 官方 uni-app x 语言服务的 Zed 适配移植版。**

复用官方本地语言服务，为 UTS、UVUE 提供代码补全、补全详情、定义跳转、
悬停类型信息和类型诊断，支持 `<script setup lang="uts">`。
本仓库提供 Zed 接入、协议桥接、兼容适配和经过测试的运行时更新。

[English](README.md) · [开发说明](CONTRIBUTING.md) ·
[发布说明](docs/PUBLISHING.md) · [变更记录](CHANGELOG.md)

## 安装与使用

当前版本 **0.3.0**，支持 Windows，正在准备插件库收录，尚未上架。
收录后可在 Zed 扩展页搜索 **uni-app x** 安装。
开发安装按开发说明准备源码，在 Zed 中使用 **Install Dev Extension**。

打开 uni-app x 项目根目录，然后打开 `.uts` 或 `.uvue` 文件。
首次启动由 Zed 自动下载固定版本的桥接程序和 DCloud 4.87.0，校验 SHA-256，
并在隔离样例上通过 26 项真实语言服务检查后启用，无需手动运行安装脚本。
Zed 提供 Node.js，Windows 自带的 `tar.exe` 需在 PATH 中。
首次准备可能需要一分钟以上；失败原因见语言服务日志，重启语言服务即可重试。
下载需要连接 GitHub Releases 和 Open VSX，代码分析在本机进行。

- 在 `uni.` 后执行 `editor: show completions` 查看官方 API 补全。
- 在导入函数或 `uni.request` 上按 F12 跳转定义。
- 悬停查看类型，修改类型错误后无需保存即可更新诊断。
- 用 `examples/demo` 中的 UTS、普通 UVUE、script setup 样例试用。

项目通常应包含 `manifest.json`、`pages.json`，manifest 中应有 `"uni-app-x": {}`。
普通 `.vue` 文件使用 Zed 的 Vue 扩展，本插件注册 `.uts` 和 `.uvue`。

## 自动更新和回退

默认每天最多检查一次官方稳定版。语言服务启动时检查；持续编辑时也会在后台
检查。后台发现新版会提示，下次语言服务启动时由 Zed 下载并校验，再运行
26 项检查，通过后才切换。失败保留旧版，成功后旧版也会留作回退。
关闭 Zed 时不检查，也不创建系统定时任务。

相较 0.2，后台只做版本发现；下载和验证改到语言服务启动阶段，以使用 Zed 的
扩展下载接口。桥接程序本身固定版本，随插件更新，不从未知版本自动替换。

在源码仓库中使用以下命令管理运行时，需要 Node.js 22 或更新版本：

```powershell
.\scripts\runtime.ps1                         # 查看版本、历史和检查结果
.\scripts\runtime.ps1 -Action check           # 立即手动检查并验证
.\scripts\runtime.ps1 -Action rollback        # 回退并暂停自动更新
.\scripts\runtime.ps1 -Action resume          # 恢复自动更新
.\scripts\runtime.ps1 -Action pause
```

手动更新或回退后重启语言服务。覆盖安装保留版本选择、历史和暂停状态。
旧包与失败记录不会自动清理。

## 配置与范围

项目 `.zed/settings.json`：

```json
{
  "lsp": {
    "uniapp-x": {
      "initialization_options": {
        "targets": ["APP-ANDROID"],
        "locale": "en",
        "autoUpdate": true
      }
    }
  }
}
```

`runtimePath` 可指定已解压的官方运行时绝对路径，此工作区不参与运行时自动管理。
`autoUpdate: false` 可关闭当前工作区自动检查；首次安装仍会完成。
`diagnostics: false` 可关闭类型诊断。修改运行时或目标平台后重启语言服务。

本次支持 Windows，macOS/Linux 会显示明确提示。真实测试主要覆盖 Android
样例中的补全、跳转、悬停、诊断和未保存修改；其他目标平台、大项目、模板/CSS、
原生类型和重构尚未完整验收，不包含 HBuilderX 的编译、运行和真机调试。

[验证记录](docs/validation)与[组件来源及许可证](THIRD_PARTY_NOTICES.md)。

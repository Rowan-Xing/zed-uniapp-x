# 配置与运行时管理

[返回使用说明](../README.zh-CN.md)

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

macOS 使用 Node 命令，指定 Zed 的扩展工作目录（自定义数据目录需相应调整）：

```sh
state="$HOME/Library/Application Support/Zed/extensions/work/uniapp-x"
node server/runtime-update.cjs status --state-dir "$state"
node server/runtime-update.cjs check --state-dir "$state"
node server/runtime-update.cjs rollback --state-dir "$state"
node server/runtime-update.cjs resume --state-dir "$state"
```

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

支持 Windows，Apple 芯片 Mac 可按[验证说明](MACOS-VALIDATION.md)试用；
Intel Mac 尚未测试，Linux 暂不支持。真实测试主要覆盖 Android
样例中的补全、跳转、悬停、诊断和未保存修改；其他目标平台、大项目、模板/CSS、
原生类型和重构尚未完整验收，不包含 HBuilderX 的编译、运行和真机调试。

[验证记录](validation)与[组件来源及许可证](../THIRD_PARTY_NOTICES.md)。

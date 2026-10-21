# Mac 实机验证

0.4.0 增加 macOS 安装适配。先在 Apple 芯片 Mac 上完成下面两部分，
分别记录命令行测试和 Zed 编辑器结果。Intel Mac 尚未验证。

## 1. 命令行检查

需要 Git、Node.js 24（含 npm）、Python 3，以及通过 rustup 安装的 Rust。
已有工具可直接使用，不必重复安装。先确认终端使用原生 arm64 环境：

```sh
uname -m
node -p 'process.platform + "/" + process.arch'
git rev-parse HEAD
bash scripts/check-macos.sh
```

前两个结果应为 `arm64` 和 `darwin/arm64`。脚本构建 Rust WASM，运行
28 项单元测试，下载并校验 DCloud 官方 4.87.0，再验证真实语言服务、
空目录安装、中文/空格路径、升级失败保护和回退。报告保存在 `test-results/`，
测试使用独立目录，不修改已安装的运行时。可用 `--vsix /absolute/path/file.vsix`
复用下载好的官方包。

## 2. Zed 编辑器检查

在 Zed 命令面板执行 `zed: install dev extension`，选择仓库目录。
Zed 会编译 Rust 和两个语法模块。然后打开 `examples/demo` 作为项目根目录，
等待首次语言服务下载及验证完成。此过程需要访问 GitHub Releases、Open VSX；
状态保存在 Zed 的扩展工作目录，与上面的独立测试目录不同。

依次检查 `sample.uts`、`pages/index/index.uvue`（script setup）、
`pages/options/options.uvue`（普通 script）：

| 操作 | 应看到的结果 |
| --- | --- |
| 打开文件 | UTS / UVUE 语言识别和语法高亮正确 |
| 在 `uni.request` 处重新输入 `uni.` | 补全菜单包含 `request` |
| 对 `greet("Zed")` 中的 `greet` 执行 Go to Definition | 跳到 `utils/greet.uts` |
| 悬停 `greet` | 显示函数签名 |
| 查看 `const count: number = "wrong"` | 出现类型错误下划线 |
| 将 `"wrong"` 改成 `1`，暂不保存 | 错误提示消失；撤销后重新出现 |
| 重启语言服务 | 使用缓存正常启动，不重复下载运行时 |

示例里某些 `count` 已是数字；验证时先把它改成 `"wrong"`，再按表格修正。
Mac 的 F12 可能被系统功能键占用，可以使用命令面板的 Go to Definition。
只改 `examples/demo`，不要改自动化测试使用的 `test/fixtures/demo`。
再用一个自己的 uni-app x 项目重复补全、跨文件跳转和错误修正即可。

失败时先执行 `zed: open log` 查看启动、下载或语法加载错误，再检查语言服务日志。
不要通过清空 Zed 数据目录或关闭诊断来让检查通过。
安装方法见 [Zed 开发扩展文档](https://zed.dev/docs/extensions/developing-extensions)。

## 留下结果

在 `docs/validation/` 新增记录：仓库 commit、macOS/芯片/Zed/Node 版本、
命令行报告位置、上表实际结果和失败日志。自动化通过不等于编辑器已经验证，
Mac 主机测试也不代表 iOS 构建、运行或真机调试已支持。

可把下面这段发给 Mac 上打开了本仓库的 Codex：

> 请按 docs/MACOS-VALIDATION.md 验证这个 Zed uni-app x 插件。
> 这是 Apple 芯片 Mac，已安装 Zed 和 Codex。先检查工具链并运行自动化测试，
> 再协助我安装开发扩展，验证 UTS、UVUE 普通 script 和 script setup 的补全、
> 跳转、悬停、类型红线和未保存修改。优先用命令行，需要我点界面时给出具体操作。
> 发现问题就定位并修复，保留已有运行时和回退记录；把实际结果记到 docs/validation/。

# 原型验证记录

日期：2026-10-20。系统：Windows x64。编辑器：Zed 1.24.3。
官方语言服务：DCloud 4.87.0。验证平台：APP-ANDROID。

## 自动集成检查

共 26 项全部通过，运行了真实 DCloud tsserver、dcloudio 插件和 indexservice。
没有模拟语言服务返回值。Node 26.8.1 和 Zed 附带的 Node 24.21.0 均通过；
`verification.json` 保存最后一次 Node 24.21.0 的结果。

每个文件类型均验证 7 项：

| 文件类型 | 官方 API 补全 | 补全详情 | 跨文件定义 | 悬停 | 类型错误与位置 | 未保存修正清错 | 官方 API 定义 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `.uts` | 通过 | 通过 | 通过 | 通过 | 通过 | 通过 | 通过 |
| `.uvue` 普通 script | 通过 | 通过 | 通过 | 通过 | 通过 | 通过 | 通过 |
| `.uvue` script setup | 通过 | 通过 | 通过 | 通过 | 通过 | 通过 | 通过 |

另外 5 项：服务初始化、emoji 后的增量编辑、快速更新/CRLF 同步、
UTF-16 诊断列位置、正常 shutdown/exit。

## Zed 界面实测

以下操作在用户已安装的 Zed 中完成，使用 `examples/demo`：

| 检查 | 实际结果 |
| --- | --- |
| UTS 语法高亮 | 正常加载 Zed 内置 TypeScript 语法 |
| UTS 补全 | 输入 `uni.requ` 后，补全列表包含 `request` 及官方签名和中文文档 |
| UTS 接受补全 | 接受 `request` 后正确恢复 `uni.request({...})` |
| UTS F12 | `greet("Zed")` 跳转到 `utils/greet.uts` 中的函数声明 |
| UTS 类型检查 | `number = "wrong"` 显示红线；改为 `42` 后未保存即消失 |
| UVUE 语法高亮 | 模板、UTS 脚本、CSS 样式均显示高亮 |
| UVUE 补全 | `<script setup lang="uts">` 内 `uni.` 能显示官方 API 及文档 |
| UVUE F12 | 脚本内 `greet("Zed")` 正确跳转到同一个 `.uts` 声明 |
| UVUE 类型检查 | 第 14 行的类型错误定位正确，改为 `42` 后红线消失 |
| 演示文件恢复 | 临时编辑已还原并保存，保留故意的类型错误供再次试用 |

普通 `<script lang="uts">` 通过协议测试，未另做一遍完整界面操作。
UVUE 样式区还显示了一条警告；本轮未对 CSS 诊断能力进行验收。

## 验证中发现并处理的问题

- DCloud 4.87.0 的诊断路径忽略仅有 `script setup` 的文件。
  已添加版本锁定的进程内补丁，覆盖错误定位和修正后的清错行为。
- 增量编辑可能早于打开文件的异步处理完成。
  已在消息到达时记录文档版本，并对快速更新/UTF-16/CRLF 做集成验证。
- UTS 的首次高亮查询将 `super` 当作匿名 token。
  已改为命名节点，Zed 中高亮加载成功。
- 覆盖更新 WASM 后，Zed 的现有文件需要执行
  `editor: restart language server` 才恢复服务。
- 本机 Ctrl+Space 没有弹出补全菜单，使用命令面板中的
  `editor: show completions` 验证成功；README 已提供此入口。

这是基本语言能力原型的验收。未完成其他目标平台、大型项目、
复杂多根工作区、完整模板/CSS 能力和运行调试打包的验收。

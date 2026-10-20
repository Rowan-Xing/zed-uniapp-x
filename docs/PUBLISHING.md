# 发布到 Zed 插件库

当前状态：0.2.0 已实现本地安装和经过测试的语言服务更新；尚未提交收录 PR。
仓库公开和插件库收录是两个步骤。以下流程依据 2026-10-20 的 Zed 官方文档。

## 项目定位和展示文案

名称：**uni-app x**

中文说明：

> DCloud 官方 uni-app x 语言服务的第三方 Zed 适配移植版。为 UTS 和 UVUE
> 提供官方语义支持，包括代码补全、定义跳转、悬停类型信息和类型错误诊断。
> 核心语言服务来自 DCloud 已发布的本地运行时，由本项目提供 Zed 扩展、
> 协议桥接、兼容适配以及测试通过后的更新与回退。
> 本项目由 Rowan-Xing 独立维护，非 DCloud 或 Zed 官方出品。

扩展描述（写入 `extension.toml`）：

> An independent Zed port of DCloud's official uni-app x language services for UTS and UVUE.

英文项目介绍，可用于后续的英文 README 和收录 PR：

> This extension adapts DCloud's official local uni-app x language services to
> Zed. It supports `.uts` and `.uvue`, including UTS script blocks in UVUE
> components, with API completion, definitions, hover information, and type
> diagnostics. Semantic analysis comes from DCloud's published runtime.
> This project maintains the Zed integration, LSP bridge, compatibility fixes,
> and tested runtime updates with rollback. It is independently maintained by
> Rowan-Xing and is not an official DCloud or Zed extension.

使用“官方”时只指 DCloud 提供的语言服务来源，不表示本扩展获得官方认证。
当前基线为 DCloud 4.87.0；验证范围主要是 Windows 和 APP-ANDROID 样例。

## 提交前还需要完成的工作

这些是对本项目现状的判断，不应写成已满足全部上架要求：

- 首次安装：目前仍需运行 `scripts/setup.ps1`。上架版需要完善首次启动时的
  服务取得方式、下载进度和失败提示，避免要求普通用户先克隆仓库运行脚本。
- 下载与打包：官方要求通过 Zed 扩展 API 下载或定位语言服务。本地原型的
  Node 更新器和嵌入式 LSP 桥接需要按这个边界整理；必要时将桥接及测试作为
  单独、固定版本的下载资源。不要把官方运行时塞进扩展包。
- 语法声明：UVUE 已声明 Vue grammar，UTS 当前借用 Zed 内置 TypeScript；
  提交前应按发布规则为提供的语言补齐明确的 grammar 声明并验证构建。
- 英文文案：插件描述、运行消息已有英文，仍需提供面向插件库用户的英文
  安装/使用说明；中文维护文档可以另行保留。
- 支持范围：当前安装和更新支持 Windows，macOS/Linux 尚未验收。
  发布说明应如实列明，未支持的平台应给出明确提示。
- 在最终提交所指向的代码版本上做最小必要的编辑器验收。优先使用协议测试，
  界面检查只覆盖命令行无法证明的行为，并尊重用户停止操作的要求。

项目自身使用 MIT；第三方运行时、语法和查询文件的许可证及来源见
[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md)。

规则来源：[发布前提](https://zed.dev/docs/extensions/publishing/prerequisites)、
[许可证要求](https://zed.dev/docs/extensions/publishing/license-requirements)。

## 收录流程

1. 将本项目仓库设为公开，选择经过验证、位于 `main` 等分支上的提交。
2. Fork [zed-industries/extensions](https://github.com/zed-industries/extensions)。
3. 在该索引仓库中添加 HTTPS Git submodule：

   ```text
   extensions/uniapp-x → https://github.com/Rowan-Xing/zed-uniapp-x.git
   ```

4. 向索引仓库顶层 `extensions.toml` 添加以下条目，版本必须与所选提交一致：

   ```toml
   [uniapp-x]
   submodule = "extensions/uniapp-x"
   version = "0.2.0"
   ```

5. 运行索引仓库的 `pnpm sort-extensions`，提交只涉及这个扩展的 PR。
6. 等待 Zed 维护者审核、修正反馈。合并后由 Zed 打包并发布到插件库。

上述版本只是当前示例；真正提交时使用完成发布准备后的版本。
官方流程：[Publishing Guide](https://zed.dev/docs/extensions/publishing/publishing-guide)。

## 后续更新

插件代码更新时，递增本项目的版本、推送代码，再在索引仓库更新 submodule
所指提交和对应版本号并提交 PR。官方流程允许通过 GitHub Action 自动准备
这类更新 PR，但仍需遵守收录仓库的审核规则。

这与运行时自动更新不同：已经安装的本插件可以检测官方语言服务的新版本，
测试通过后更新本机运行时；涉及桥接代码或 Zed 扩展本身的更新仍需发布新版扩展。

来源：[Updating an Extension](https://zed.dev/docs/extensions/publishing/updating-and-maintenance)。

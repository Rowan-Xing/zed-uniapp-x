# uni-app x for Zed

DCloud 官方 uni-app x 语言服务的 Zed 适配移植版。
为 `.uts`、`.uvue` 提供代码补全、定义跳转、悬停类型提示和类型诊断，
支持 `<script setup lang="uts">`，代码分析在本机完成。

[English](README.md)

## 安装

支持 **Windows**。从源码安装前，先安装 [Rust](https://rustup.rs/)，再克隆仓库：

```sh
git clone https://github.com/Rowan-Xing/zed-uniapp-x.git
```

在 Zed 命令面板执行 **Install Dev Extension**，选择克隆后的仓库目录。
首次启动会自动下载语言服务，需要能访问 GitHub Releases 和 Open VSX，
等待几分钟即可。

## 使用

用 Zed 打开 uni-app x 项目根目录，然后打开 `.uts` 或 `.uvue` 文件：

- 输入 `uni.` 查看 API 补全。
- 在符号上按 **F12** 跳转到定义。
- 悬停查看类型信息。
- 类型错误会显示下划线，修改代码后自动更新。

可以用[示例项目](examples/demo)试用。普通 `.vue` 文件请安装
[Vue 扩展](https://github.com/zed-extensions/vue)。

[配置、更新与回退](docs/USAGE.zh-CN.md) ·
[开发说明](CONTRIBUTING.md) · [变更记录](CHANGELOG.md)

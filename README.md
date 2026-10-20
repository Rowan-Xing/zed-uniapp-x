# uni-app x for Zed

A Zed port of DCloud's official uni-app x language services.
Provides completion, go to definition, hover, and type diagnostics for `.uts`
and `.uvue`, including `<script setup lang="uts">`. Code analysis runs locally.

[中文说明](README.zh-CN.md)

## Install

Supports **Windows**. To install from source, install [Rust](https://rustup.rs/)
and clone this repository:

```sh
git clone https://github.com/Rowan-Xing/zed-uniapp-x.git
```

In Zed, open the command palette, run **Install Dev Extension**, and select the
cloned folder. First launch automatically downloads the language service;
allow a few minutes and access to GitHub Releases and Open VSX.

## Use

Open your uni-app x project root in Zed, then open a `.uts` or `.uvue` file.

- Type `uni.` to see API completions.
- Press **F12** on a symbol to go to its definition.
- Hover over a symbol to see its type.
- Type errors are underlined and update as you edit.

Try the [demo project](examples/demo). For ordinary `.vue` files, install the
[Vue extension](https://github.com/zed-extensions/vue).

[Configuration, updates and rollback](docs/USAGE.md) ·
[Development](CONTRIBUTING.md) · [Changelog](CHANGELOG.md)

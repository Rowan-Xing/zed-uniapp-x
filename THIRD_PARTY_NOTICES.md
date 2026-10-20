# Third-party components

This is an independent local prototype, not an official DCloud or Zed release.

## DCloud HBuilderX Language Services 4.87.0

The installer downloads the unmodified `dcloud-ide.hbuilderx-language-services`
VSIX from Open VSX. It is not bundled in this source/package.

- Source/project: https://github.com/dcloudio/hbuilderx-language-services
- Distribution: https://open-vsx.org/extension/dcloud-ide/hbuilderx-language-services
- Package license declaration: Apache-2.0
- Full package license: `LICENSE.txt` inside the downloaded extension.
- The downloaded package contains additional dependencies and their notices;
  those remain with the local runtime.
- SHA-256:
  `d8d0e7838881ed810aa15ecbe3d1466aefa3c6b56d46e1a5695446e597ff5d51`

`server/dcloud-compat.cjs` applies a narrowly scoped, version-pinned in-memory
change to DCloud's `vueservice/packages/vue-typescript/out/sourceFile.js`:
`getScript()` falls back to `scriptSetup` when there is no normal script block.
The original file is not changed. This restores the tested `<script setup>`
diagnostic path; it is not a replacement implementation of DCloud's checker.

## Tree-sitter TypeScript

- https://github.com/tree-sitter/tree-sitter-typescript
- MIT, Copyright (c) 2017 Max Brunsfeld
- License: `licenses/tree-sitter-typescript-MIT.txt`
- The extension uses Zed's built-in `typescript` grammar. No TypeScript grammar
  binary is bundled here; its exact version follows the installed Zed version.

## Tree-sitter Vue

- https://github.com/tree-sitter-grammars/tree-sitter-vue
- Revision: `7e48557b903a9db9c38cea3b7839ef7e1f36c693`
- MIT, Copyright (c) Ika
- License: `licenses/tree-sitter-vue-MIT.txt`
- `grammars/vue.wasm` is taken from the official Zed Vue extension 0.4.1,
  whose manifest pins this revision.
- Distribution: https://api.zed.dev/extensions/vue/0.4.1/download
- Grammar SHA-256:
  `d654acab62559507d310262b8254afaacba6243edecdfb12d578cfc531ee431b`

## Zed Vue extension queries

`languages/uvue/{highlights,brackets,indents,outline}.scm` come from
https://github.com/zed-extensions/vue/tree/main/languages/vue
(retrieved 2026-10-20). They retain the original query contents.
Copyright 2022-2024 Zed Industries Inc., Apache-2.0.
See `licenses/zed-vue-APACHE-2.0.txt`.

UTS queries and UVUE injection queries were written for this prototype.
The Rust adapter uses `zed_extension_api 0.7.0` (Apache-2.0);
transitive build dependencies and exact versions are recorded in `Cargo.lock`.

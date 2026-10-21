# Third-party components

This extension adapts DCloud's local uni-app x language services to Zed.

## DCloud HBuilderX Language Services (bootstrap: 4.87.0)

The installer downloads the unmodified `dcloud-ide.hbuilderx-language-services`
VSIX from Open VSX. It is not bundled in this source/package.

- Project link: https://github.com/dcloudio/hbuilderx-language-services
  (the default branch contained only its README when checked on 2026-10-20;
  this project consumes the published JavaScript distribution, not a source build).
- Distribution: https://open-vsx.org/extension/dcloud-ide/hbuilderx-language-services
- Package license declaration: Apache-2.0
- Full package license: `LICENSE.txt` inside the downloaded extension.
- The downloaded package contains additional dependencies and their notices;
  those remain with the local runtime.
- SHA-256:
  `d8d0e7838881ed810aa15ecbe3d1466aefa3c6b56d46e1a5695446e597ff5d51`

The updater downloads stable releases from the same publisher, checks the
registry's SHA-256 and package identity, preserves the original license files,
and runs the real regression suite before selecting the candidate.
Each candidate's version, URL, checksum and test receipt remain in its local directory.

`server/dcloud-compat.cjs` applies a narrowly scoped, expression-matched in-memory
change to DCloud's `vueservice/packages/vue-typescript/out/sourceFile.js`:
`getScript()` falls back to `scriptSetup` when there is no normal script block.
The original file is not changed. This restores the tested `<script setup>`
diagnostic path; it is not a replacement implementation of DCloud's checker.
The known expression must match exactly once for 4.87.0. Future versions with a
different getter run without the patch and must pass the same setup diagnostics
tests before activation.

## ZIP extraction

The bridge bundles the pure-JavaScript ZIP reader `yauzl` 3.4.0 and its dependency
`pend` 1.2.0, both MIT. Exact distributions and integrity hashes are locked in
`package-lock.json`. Their original `LICENSE` files are included under
`node_modules/yauzl` and `node_modules/pend` in the bridge archive.

- https://github.com/thejoshwolfe/yauzl
- https://github.com/andrewrk/node-pend

## Tree-sitter TypeScript

- https://github.com/tree-sitter/tree-sitter-typescript
- MIT, Copyright (c) 2017 Max Brunsfeld
- License: `licenses/tree-sitter-typescript-MIT.txt`
- Revision: `75b3874edb2dc714fb1fd77a32013d0f8699989f`, subdirectory `typescript`.
- Zed builds the grammar from the revision in `extension.toml`.

## Tree-sitter Vue

- https://github.com/tree-sitter-grammars/tree-sitter-vue
- Revision: `7e48557b903a9db9c38cea3b7839ef7e1f36c693`
- MIT, Copyright (c) Ika
- License: `licenses/tree-sitter-vue-MIT.txt`
- Zed builds the grammar from the revision in `extension.toml`.
- The 0.1/0.2 local prototypes used a precompiled grammar from the Zed Vue 0.4.1
  distribution, with SHA-256
  `d654acab62559507d310262b8254afaacba6243edecdfb12d578cfc531ee431b`.

## Zed Vue extension queries

`languages/uvue/{highlights,brackets,indents,outline}.scm` come from
https://github.com/zed-extensions/vue/tree/main/languages/vue
(retrieved 2026-10-20). They retain the original query contents.
Copyright 2022-2024 Zed Industries Inc., Apache-2.0.
See `licenses/zed-vue-APACHE-2.0.txt`.

UTS queries and UVUE injection queries were written for this prototype.
The Rust adapter uses `zed_extension_api 0.7.0` (Apache-2.0);
transitive build dependencies and exact versions are recorded in `Cargo.lock`.

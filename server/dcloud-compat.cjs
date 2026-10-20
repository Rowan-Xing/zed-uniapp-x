'use strict';

// DCloud 4.87.0 asks getScript() before running diagnostics, but that getter
// excludes <script setup>. Use its actual setup block when no normal block exists.
// This scoped, in-memory patch leaves the downloaded runtime unchanged.
const fs = require('node:fs');
const Module = require('node:module');
const loadJavaScript = Module._extensions['.js'];
Module._extensions['.js'] = function (module, filename) {
  const normalized = filename.replaceAll('\\', '/');
  if (normalized.endsWith('/vueservice/packages/vue-typescript/out/sourceFile.js')) {
    const source = fs.readFileSync(filename, 'utf8');
    const needle = 'getScript:()=>c.script,';
    if (source.split(needle).length !== 2) {
      throw new Error('Unsupported DCloud runtime: the 4.87.0 script-setup patch no longer matches.');
    }
    module._compile(source.replace(needle, 'getScript:()=>c.script??c.scriptSetup,'), filename);
    return;
  }
  loadJavaScript(module, filename);
};

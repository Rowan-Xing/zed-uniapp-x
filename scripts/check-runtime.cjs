#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { bootstrapRelease } = require('../server/installer.cjs');
const { stageRelease, verifyRuntime } = require('../server/runtime-update.cjs');

const repo = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const value = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
// Keep the outer wrapper short: Windows CreateProcess still limits cwd length,
// even though Node can extract individual files with much longer paths.
const root = path.resolve(value('--work') || path.join(repo, 'test-results'),
  `check-${randomUUID().slice(0, 8)}`);

function run(...arguments_) {
  const result = spawnSync(process.execPath, arguments_, { cwd: repo, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Check failed: ${arguments_.join(' ')}`);
}

(async () => {
  fs.mkdirSync(root, { recursive: true });
  const version = require('../package.json').version;
  for (const file of ['Cargo.toml', 'extension.toml']) {
    if (fs.readFileSync(path.join(repo, file), 'utf8').match(/^version\s*=\s*"([^"]+)"/m)?.[1] !== version) {
      throw new Error(`${file} version differs from package.json.`);
    }
  }
  run('--test', 'test/extract-runtime.test.cjs', 'test/runtime-update.test.cjs', 'test/installer.test.cjs');
  const staging = path.join(root, 'bootstrap');
  fs.mkdirSync(staging);
  console.log('Preparing the checksum-pinned official DCloud runtime...');
  const runtime = await stageRelease(bootstrapRelease(), staging, { vsix: value('--vsix') });
  const runtimeReport = await verifyRuntime(runtime, staging);
  const vsix = path.join(staging, 'official.vsix');
  run('test/fresh-install.cjs', '--bridge', path.join(repo, `dist/uniapp-x-bridge-${version}.tar.gz`),
    '--vsix', vsix, '--work', root);
  run('test/update-lifecycle.cjs', '--runtime', runtime, '--vsix', vsix, '--work', root);
  const report = {
    pass: true, version, platform: process.platform, arch: process.arch, os: os.release(),
    node: process.version, runtime, runtimeReport,
    checks: ['28 unit tests', '26 official language-service checks',
      'packaged fresh installation and managed launch', 'update, failure rejection and rollback'],
    editorChecked: false,
  };
  fs.writeFileSync(path.join(root, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`PASS ${process.platform}/${process.arch}\nREPORT ${path.join(root, 'report.json')}`);
})().catch(error => { console.error(error); console.error(`Logs retained in ${root}`); process.exitCode = 1; });

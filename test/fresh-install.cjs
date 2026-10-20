'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { createHash } = require('node:crypto');
const arg = name => process.argv[process.argv.indexOf(name) + 1];
const root = path.resolve(arg('--work'), `fresh-${randomUUID()}`);
const archive = path.resolve(arg('--bridge'));
const vsix = path.resolve(arg('--vsix'));
const metadata = require('../bridge-release.json');

(async () => {
  fs.mkdirSync(root, { recursive: true });
  assert.equal(createHash('sha256').update(fs.readFileSync(archive)).digest('hex'), metadata.sha256);
  const bridge = path.join(root, 'downloaded-bridge');
  fs.mkdirSync(bridge);
  const extracted = spawnSync('tar', ['-xzf', archive, '-C', bridge], { windowsHide: true, encoding: 'utf8' });
  assert.equal(extracted.status, 0, extracted.stderr);
  const installer = require(path.join(bridge, 'server/installer.cjs'));
  const store = require(path.join(bridge, 'server/runtime-store.cjs'));
  const { verifyRuntime } = require(path.join(bridge, 'server/runtime-update.cjs'));
  const stateDirectory = path.join(root, '状态 with spaces');
  fs.mkdirSync(stateDirectory);
  const prepared = installer.prepare(stateDirectory);
  assert.equal(prepared.hasActive, false);
  const ticket = installer.plan(stateDirectory, prepared.release);
  fs.copyFileSync(vsix, path.join(stateDirectory, ticket.archiveRelative));
  await installer.install(stateDirectory, ticket.requestRelative);
  const state = store.loadState(stateDirectory);
  assert.equal(state.active.version, store.policy.bootstrapVersion);
  assert.equal(installer.prepare(stateDirectory).status, 'ready');
  const session = path.join(root, 'managed-launch');
  fs.mkdirSync(session);
  const launchReport = await verifyRuntime(state.active.path, session, { stateDirectory });
  const report = {
    pass: true, bridgeSha256: metadata.sha256, runtimeVersion: state.active.version,
    checks: ['downloaded bridge archive', 'empty work directory', 'official VSIX SHA-256',
      '26 real checks before first activation', 'Unicode and spaces in work directory',
      '26 real checks through the packaged managed launcher', 'cached startup without download'],
    runtimeReport: state.active.report, launchReport,
  };
  fs.writeFileSync(path.join(root, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`PASS packaged fresh installation\nREPORT ${path.join(root, 'report.json')}`);
})().catch(error => { console.error(error); process.exitCode = 1; });

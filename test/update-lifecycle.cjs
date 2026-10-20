'use strict';

// Exercise the real download/checksum/extraction/test/activation/rollback path.
// Revalidation installs the SAME official version into a new retained directory;
// it does not pretend that an unreleased upstream version exists.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { check, configure, verifyRuntime } = require('../server/runtime-update.cjs');
const { initialState, saveState, loadState, selectRuntime, policy } = require('../server/runtime-store.cjs');
const arg = name => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};

(async () => {
  const runtime = path.resolve(arg('--runtime'));
  const root = path.resolve(arg('--work') || 'test-results', `update-lifecycle-${randomUUID()}`);
  fs.mkdirSync(root, { recursive: true });
  saveState(root, initialState(root, runtime));
  const update = await check(root, {
    version: policy.bootstrapVersion, revalidate: true, vsix: arg('--vsix'),
  });
  assert.equal(update.status, 'updated');
  assert.notEqual(selectRuntime(root), runtime);
  assert.equal(loadState(root).history[0].path, runtime);
  const validated = JSON.parse(fs.readFileSync(update.report, 'utf8'));
  assert.equal(validated.tests.length, 26);
  const candidate = selectRuntime(root);

  // A broken bridge/runtime process must make the REAL regression runner fail.
  // Only alter this isolated test copy after recording its successful receipt.
  const entry = path.join(candidate, 'node_modules/typescript/lib/tsserver.js');
  const original = fs.readFileSync(entry);
  const failureSession = path.join(root, 'rejected');
  fs.mkdirSync(failureSession);
  try {
    fs.writeFileSync(entry, 'process.exit(17);\n');
    await assert.rejects(verifyRuntime(candidate, failureSession), /Process exited/);
  } finally { fs.writeFileSync(entry, original); }

  configure(root, 'rollback');
  assert.equal(selectRuntime(root), runtime);
  assert.equal(loadState(root).autoUpdate, false);
  assert.ok(fs.existsSync(path.join(candidate, 'package.json')));
  const pause = await check(root, { automatic: true });
  assert.equal(pause.status, 'paused');
  configure(root, 'resume');
  assert.equal(loadState(root).autoUpdate, true);
  const launchSession = path.join(root, 'managed-launch');
  fs.mkdirSync(launchSession);
  const launchReport = await verifyRuntime(runtime, launchSession, { stateDirectory: root });
  const report = {
    pass: true, upstreamVersion: policy.bootstrapVersion, candidate, rollback: runtime,
    checks: ['official SHA-256 and extraction', '26 real LSP checks', 'atomic activation',
      'real regression runner rejects broken tsserver', 'rollback retains both copies',
      'rollback pauses updates', 'resume updates', '26 checks through managed launcher after rollback'],
    runtimeReport: update.report, launchReport,
  };
  fs.writeFileSync(path.join(root, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`PASS real runtime update lifecycle\nREPORT ${path.join(root, 'report.json')}`);
})().catch(error => { console.error(error); process.exitCode = 1; });

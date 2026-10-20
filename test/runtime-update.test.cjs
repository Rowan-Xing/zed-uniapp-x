'use strict';

// These tests isolate update orchestration with deliberately empty runtime
// fixtures. DCloud semantics are exercised separately by integration.cjs and
// update-lifecycle.cjs against an unmodified official VSIX.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { check, configure, stageRelease } = require('../server/runtime-update.cjs');
const {
  loadState, saveState, initialState, selectRuntime, acquireLock, compareVersions, policy,
} = require('../server/runtime-store.cjs');
const suiteRoot = path.resolve(process.env.UNIAPP_X_TEST_WORK || '.cache/update-tests', randomUUID());

function fakeRuntime(directory, version = policy.bootstrapVersion) {
  const files = {
    'package.json': JSON.stringify({ name: policy.name, publisher: policy.namespace, version }),
    'node_modules/typescript/lib/tsserver.js': '',
    'jsservice/out/tsplugins/node_modules/dcloudio/index.js': '',
    'indexservice/out/server/server.js': '',
    'vueservice/packages/vue-typescript/out/sourceFile.js': '',
    'node_modules/vscode-languageserver/node.js': '',
  };
  for (const [name, contents] of Object.entries(files)) {
    const file = path.join(directory, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  }
  return directory;
}

function fixture() {
  const root = path.join(suiteRoot, randomUUID(), '状态 with spaces');
  const runtime = fakeRuntime(path.join(root, 'bootstrap', 'extension'));
  fs.writeFileSync(path.join(root, 'runtime-path.txt'), runtime);
  const state = initialState(root);
  saveState(root, state);
  return { root, state, runtime };
}

function dependencies(overrides = {}) {
  return {
    getRelease: async () => ({ version: '4.88.0', sha256: 'a'.repeat(64), url: 'unit-test fixture' }),
    fingerprint: () => 'test-bridge',
    stageRelease: async (release, session) => fakeRuntime(path.join(session, 'package/extension'), release.version),
    verifyRuntime: async () => 'unit-test receipt',
    ...overrides,
  };
}

test('numeric stable versions and prerelease rejection', () => {
  assert.equal(compareVersions('4.100.0', '4.99.0'), 1);
  assert.equal(compareVersions('4.87.0', '4.87.0'), 0);
  for (const value of ['latest', '../4.88.0', '4.88.0-beta', '4.08.0']) {
    assert.throws(() => compareVersions(value, '4.87.0'));
  }
});

test('legacy installation imports bootstrap and explicit path overrides managed selection', () => {
  const { root, runtime } = fixture();
  assert.equal(selectRuntime(root), runtime);
  assert.equal(selectRuntime(root, path.join(root, 'custom')), path.join(root, 'custom'));
  const invalid = fakeRuntime(path.join(root, 'unvalidated'), '4.88.0');
  assert.throws(() => initialState(path.join(root, 'other'), invalid), /Initial managed runtime/);
});

test('same or older registry version does not download or switch', async () => {
  const { root, runtime } = fixture();
  for (const version of ['4.87.0', '4.84.3']) {
    const result = await check(root, {}, dependencies({
      getRelease: async () => ({ version }),
      stageRelease: () => { throw new Error('must not download'); },
    }));
    assert.equal(result.status, 'current');
    assert.equal(selectRuntime(root), runtime);
  }
});

test('automatic checks are throttled for 24 hours across workspaces', async () => {
  const { root } = fixture();
  let requests = 0;
  const deps = dependencies({ getRelease: async () => { requests++; return { version: '4.87.0' }; } });
  await check(root, { automatic: true }, deps);
  assert.equal((await check(root, { automatic: true }, deps)).status, 'not-due');
  assert.equal(requests, 1);
});

test('activation waits until validation finishes and preserves the old runtime', async () => {
  const { root, runtime } = fixture();
  let allowValidation, started;
  const waiting = new Promise(resolve => { started = resolve; });
  const gate = new Promise(resolve => { allowValidation = resolve; });
  const update = check(root, {}, dependencies({
    verifyRuntime: async () => { started(); await gate; return 'receipt'; },
  }));
  await waiting;
  assert.equal(selectRuntime(root), runtime);
  assert.equal((await check(root, {}, dependencies())).status, 'busy');
  assert.throws(() => configure(root, 'rollback'), /running/);
  allowValidation();
  assert.equal((await update).status, 'updated');
  const state = loadState(root);
  assert.equal(state.active.version, '4.88.0');
  assert.equal(state.history[0].path, runtime);
  assert.ok(fs.existsSync(path.join(runtime, 'package.json')));
});

test('registry failure preserves selection and releases the lock', async () => {
  const { root, runtime } = fixture();
  await assert.rejects(check(root, {}, dependencies({
    getRelease: async () => { throw new Error('offline'); },
  })), /offline/);
  assert.equal(selectRuntime(root), runtime);
  assert.equal(loadState(root).lastResult.status, 'failed');
  const unlock = acquireLock(root);
  assert.equal(typeof unlock, 'function');
  unlock();
});

test('failed extraction or semantic validation never replaces the active runtime', async () => {
  for (const stage of ['stageRelease', 'verifyRuntime']) {
    const { root, runtime } = fixture();
    await assert.rejects(check(root, {}, dependencies({
      [stage]: async () => { throw new Error('candidate rejected'); },
    })), /candidate rejected/);
    assert.equal(selectRuntime(root), runtime);
    assert.equal(loadState(root).history.length, 0);
    if (stage === 'verifyRuntime') assert.equal(loadState(root).failedCandidate.version, '4.88.0');
    else assert.equal(loadState(root).failedCandidate, undefined);
  }
});

test('unchanged rejected candidates are not repeatedly executed; new bridge retries them', async () => {
  const { root } = fixture();
  await assert.rejects(check(root, {}, dependencies({
    verifyRuntime: async () => { throw new Error('broken'); },
  })));
  const state = loadState(root);
  state.lastAttempt = null;
  saveState(root, state);
  assert.equal((await check(root, { automatic: true }, dependencies())).status, 'previously-failed');
  const retry = loadState(root);
  retry.lastAttempt = null;
  saveState(root, retry);
  assert.equal((await check(root, { automatic: true }, dependencies({
    fingerprint: () => 'fixed-bridge',
  }))).status, 'updated');
});

test('rollback selects a retained version, pauses automatic upgrades, and can resume', async () => {
  const { root, runtime } = fixture();
  await check(root, {}, dependencies());
  const rolled = configure(root, 'rollback');
  assert.equal(rolled.active.path, runtime);
  assert.equal(rolled.autoUpdate, false);
  assert.equal(rolled.history[0].version, '4.88.0');
  assert.equal((await check(root, { automatic: true }, dependencies({
    getRelease: () => { throw new Error('must not access network'); },
  }))).status, 'paused');
  assert.equal(configure(root, 'resume').autoUpdate, true);
  assert.equal((await check(root, { automatic: true }, dependencies())).status, 'updated');
});

test('missing rollback target leaves selection untouched', () => {
  const { root, runtime } = fixture();
  assert.throws(() => configure(root, 'rollback'), /No retained/);
  assert.equal(selectRuntime(root), runtime);
  assert.equal(loadState(root).failedCandidate, undefined);
});

test('reinstall initialization preserves the chosen version, history, and pause setting', async () => {
  const { root, runtime } = fixture();
  await check(root, {}, dependencies());
  configure(root, 'pause');
  const before = loadState(root);
  configure(root, 'init', { runtime });
  assert.deepEqual(loadState(root), before);
});

test('corrupt state fails closed instead of falling back to a stale legacy pointer', () => {
  const { root } = fixture();
  fs.writeFileSync(path.join(root, 'runtime-state.json'), '{partial');
  assert.throws(() => selectRuntime(root), SyntaxError);
});

test('a live update lock cannot be stolen; an abandoned lock is recoverable', () => {
  const { root } = fixture();
  const unlock = acquireLock(root);
  assert.equal(acquireLock(root), null);
  unlock();
  fs.writeFileSync(path.join(root, 'runtime-update.lock'), JSON.stringify({ pid: -1, token: 'abandoned' }));
  const recovered = acquireLock(root);
  assert.equal(typeof recovered, 'function');
  recovered();
});

test('cancellation after validation does not activate the candidate', async () => {
  const { root, runtime } = fixture();
  const controller = new AbortController();
  await assert.rejects(check(root, { signal: controller.signal }, dependencies({
    verifyRuntime: async () => { controller.abort(new Error('editor closed')); return 'receipt'; },
  })), /editor closed/);
  assert.equal(selectRuntime(root), runtime);
  assert.equal(loadState(root).failedCandidate, undefined);
});

test('SHA mismatch is rejected before extracting or executing the VSIX', { skip: process.platform !== 'win32' }, async () => {
  const { root } = fixture();
  const source = path.join(root, 'wrong.vsix');
  fs.writeFileSync(source, 'not the official package');
  const session = path.join(root, 'candidate');
  fs.mkdirSync(session);
  await assert.rejects(stageRelease({ sha256: '0'.repeat(64) }, session, { vsix: source }), /SHA-256 mismatch/);
  assert.equal(fs.existsSync(path.join(session, 'package')), false);
});

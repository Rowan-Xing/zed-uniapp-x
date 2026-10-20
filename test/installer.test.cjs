'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { prepare, plan, install, bootstrapRelease, validateRelease, inside } = require('../server/installer.cjs');
const { loadState, saveState, initialState, policy } = require('../server/runtime-store.cjs');
const { check, configure } = require('../server/runtime-update.cjs');

const suiteRoot = path.resolve(process.env.UNIAPP_X_TEST_WORK || '.cache/installer-tests', randomUUID());
function root() {
  const directory = path.join(suiteRoot, randomUUID(), '安装 with spaces');
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}
function fakeRuntime(directory, version = policy.bootstrapVersion) {
  for (const name of [
    'node_modules/typescript/lib/tsserver.js', 'node_modules/vscode-languageserver/node.js',
    'jsservice/out/tsplugins/node_modules/dcloudio/index.js', 'indexservice/out/server/server.js',
    'vueservice/packages/vue-typescript/out/sourceFile.js',
  ]) {
    fs.mkdirSync(path.dirname(path.join(directory, name)), { recursive: true });
    fs.writeFileSync(path.join(directory, name), '');
  }
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({
    name: policy.name, publisher: policy.namespace, version,
  }));
  return directory;
}
function dependencies(overrides = {}) {
  // Transaction fixtures only. Fresh-install.cjs separately runs real DCloud checks.
  return {
    stageRelease: async (release, session) => fakeRuntime(path.join(session, 'package/extension'), release.version),
    verifyRuntime: async () => 'unit-test receipt',
    ...overrides,
  };
}
function newer() {
  return {
    version: '4.88.0', sha256: 'a'.repeat(64),
    url: `${policy.registry}/4.88.0/file/${policy.namespace}.${policy.name}-4.88.0.vsix`,
  };
}

test('fresh installation plans the pinned release without assuming an existing runtime', () => {
  const directory = root();
  assert.deepEqual(prepare(directory), { status: 'download', release: bootstrapRelease(), hasActive: false });
  assert.equal(loadState(directory), null);
  const ticket = plan(directory, bootstrapRelease());
  assert.equal(ticket.status, 'download');
  assert.ok(fs.existsSync(inside(directory, ticket.requestRelative)));
  assert.equal(loadState(directory), null);
});
test('fresh installation only creates active state after validation', async () => {
  const directory = root();
  const ticket = plan(directory, bootstrapRelease());
  await assert.rejects(install(directory, ticket.requestRelative, dependencies({
    verifyRuntime: async () => { assert.equal(loadState(directory), null); throw new Error('real checker failed'); },
  })), /real checker failed/);
  assert.equal(loadState(directory), null);
  const retry = plan(directory, bootstrapRelease());
  await install(directory, retry.requestRelative, dependencies());
  assert.equal(loadState(directory).active.version, policy.bootstrapVersion);
  assert.deepEqual(loadState(directory).history, []);
  assert.equal(prepare(directory).status, 'ready');
});
test('fresh installer rejects a corrupt downloaded archive', async () => {
  const directory = root();
  const ticket = plan(directory, bootstrapRelease());
  fs.writeFileSync(inside(directory, ticket.archiveRelative), 'not an official VSIX');
  await assert.rejects(install(directory, ticket.requestRelative), /SHA-256 mismatch/);
  assert.equal(loadState(directory), null);
});
test('release URLs, bootstrap hashes and relative paths are checked', () => {
  const directory = root();
  assert.throws(() => validateRelease({ ...bootstrapRelease(), url: 'https://example.com/runtime.vsix' }));
  assert.throws(() => validateRelease({ ...bootstrapRelease(), sha256: 'a'.repeat(64) }));
  assert.throws(() => plan(directory, newer()), /pinned bootstrap/);
  assert.throws(() => inside(directory, '../escape'));
  assert.throws(() => inside(directory, directory));
});
test('legacy state, pause and explicit autoUpdate false survive gallery startup', () => {
  const directory = root();
  const runtime = fakeRuntime(path.join(directory, `dcloud-${policy.bootstrapVersion}/extension`));
  assert.equal(prepare(directory).status, 'check');
  assert.equal(loadState(directory).active.path, runtime);
  assert.equal(prepare(directory, false).status, 'ready');
  configure(directory, 'pause');
  assert.equal(prepare(directory).status, 'ready');
  assert.equal(plan(directory, newer()).status, 'ready');
});
test('background discovery records a candidate without downloading or executing it', async () => {
  const directory = root();
  saveState(directory, initialState(directory, fakeRuntime(path.join(directory, 'old'))));
  const result = await check(directory, { automatic: true, discoverOnly: true }, {
    getRelease: async () => newer(),
    stageRelease: () => { throw new Error('background discovery must not download'); },
  });
  assert.equal(result.status, 'available');
  assert.equal(loadState(directory).active.version, policy.bootstrapVersion);
  assert.equal(prepare(directory).status, 'download');
  const ticket = plan(directory, newer());
  configure(directory, 'pause');
  assert.equal((await install(directory, ticket.requestRelative, dependencies())).status, 'ready');
  assert.equal(loadState(directory).active.version, policy.bootstrapVersion);
});
test('failed gallery updates retain the active runtime and are not retried by unchanged bridge', async () => {
  const directory = root();
  const old = fakeRuntime(path.join(directory, 'old'));
  saveState(directory, initialState(directory, old));
  const ticket = plan(directory, newer());
  await assert.rejects(install(directory, ticket.requestRelative, dependencies({
    verifyRuntime: async () => { throw new Error('candidate diagnostics failed'); },
  })), /candidate diagnostics failed/);
  assert.equal(loadState(directory).active.path, old);
  assert.equal(plan(directory, newer()).reason, 'previously-failed');
});
test('a validated gallery update retains the previous runtime for rollback', async () => {
  const directory = root();
  const old = fakeRuntime(path.join(directory, 'old'));
  saveState(directory, initialState(directory, old));
  const ticket = plan(directory, newer());
  await install(directory, ticket.requestRelative, dependencies());
  assert.equal(loadState(directory).active.version, '4.88.0');
  assert.equal(loadState(directory).history[0].path, old);
  configure(directory, 'rollback');
  assert.equal(loadState(directory).active.path, old);
  assert.equal(loadState(directory).autoUpdate, false);
});

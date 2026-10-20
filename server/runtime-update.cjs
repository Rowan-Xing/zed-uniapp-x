#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const {
  policy, versionParts, compareVersions, validateRuntime, loadState, saveState,
  initialState, acquireLock, activate,
} = require('./runtime-store.cjs');

async function request(url, limit, destination, signal, timeout = 30_000) {
  const controller = new AbortController();
  const cancel = () => controller.abort(signal.reason);
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  const timer = setTimeout(() => controller.abort(new Error('Download timed out.')), timeout);
  let handle;
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok || !response.url.startsWith('https://')) {
      throw new Error(`Official registry request failed: HTTP ${response.status}.`);
    }
    if (destination) handle = await fs.promises.open(destination, 'wx');
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > limit) throw new Error('Official registry response exceeds the size limit.');
      if (handle) await handle.writeFile(chunk);
      else chunks.push(chunk);
    }
    return destination || Buffer.concat(chunks).toString('utf8');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
    await handle?.close();
  }
}

async function getRelease(version, signal) {
  if (version) versionParts(version);
  const metadata = JSON.parse(await request(`${policy.registry}/${version || 'latest'}`, 1024 * 1024, null, signal));
  if (metadata.namespace !== policy.namespace || metadata.name !== policy.name || metadata.preview === true) {
    throw new Error('The registry did not return an official stable DCloud release.');
  }
  versionParts(metadata.version);
  if (version && version !== metadata.version) throw new Error('Registry version mismatch.');
  const prefix = `${policy.registry}/${metadata.version}/file/${policy.namespace}.${policy.name}-${metadata.version}`;
  if (metadata.files?.download !== `${prefix}.vsix` || metadata.files?.sha256 !== `${prefix}.sha256`) {
    throw new Error('Unexpected official download/checksum URL.');
  }
  const checksum = await request(metadata.files.sha256, 4096, null, signal);
  const sha256 = checksum.trim().split(/\s+/)[0].toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('Invalid registry SHA-256.');
  if (metadata.version === policy.bootstrapVersion && sha256 !== policy.bootstrapSha256) {
    throw new Error('The bootstrap checksum differs from the pinned known release.');
  }
  return { version: metadata.version, sha256, url: metadata.files.download };
}

async function fileHash(file) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

function bridgeFingerprint() {
  const hash = createHash('sha256');
  for (const file of ['server.cjs', 'ts-client.cjs', 'dcloud-compat.cjs', 'runtime-store.cjs',
    'runtime-policy.json', 'runtime-update.cjs', 'installer.cjs', 'extract-runtime.ps1', '../test/integration.cjs']) {
    hash.update(fs.readFileSync(path.join(__dirname, file)));
  }
  const visit = directory => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(directory, item.name);
      hash.update(item.name);
      if (item.isDirectory()) visit(file);
      else hash.update(fs.readFileSync(file));
    }
  };
  visit(path.join(__dirname, '../test/fixtures/demo'));
  return hash.digest('hex');
}

function run(command, args, { log, signal, timeout = 5 * 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], signal,
      env: { ...process.env, UNIAPP_X_SKIP_UPDATE: '1' },
    });
    const output = chunk => { if (log) fs.appendFileSync(log, chunk); };
    child.stdout.on('data', output);
    child.stderr.on('data', output);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeout);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => {
      clearTimeout(timer);
      if (timedOut) reject(new Error(`Process timed out; see ${log || command}.`));
      else if (code !== 0) reject(new Error(`Process exited with ${code}; see ${log || command}.`));
      else resolve();
    });
  });
}

async function stageRelease(release, session, { vsix, signal } = {}) {
  if (process.platform !== 'win32') throw new Error('Automatic runtime installation currently supports Windows only.');
  const archive = path.join(session, 'official.vsix');
  if (vsix) fs.copyFileSync(path.resolve(vsix), archive, fs.constants.COPYFILE_EXCL);
  else {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const partial = path.join(session, `download-${attempt}.vsix`);
      try {
        await request(release.url, 512 * 1024 * 1024, partial, signal, 5 * 60_000);
        fs.renameSync(partial, archive);
        break;
      } catch (error) {
        fs.appendFileSync(path.join(session, 'download.log'), `Attempt ${attempt}: ${error.message}\n`);
        if (signal?.aborted || attempt === 3) throw error;
      }
    }
  }
  if (await fileHash(archive) !== release.sha256) throw new Error('Official VSIX SHA-256 mismatch; active runtime was kept.');
  const destination = path.join(session, 'package');
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  await run(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', path.join(__dirname, 'extract-runtime.ps1'), '-Archive', archive, '-Destination', destination],
  { log: path.join(session, 'extract.log'), signal });
  const runtime = path.join(destination, 'extension');
  validateRuntime(runtime, release.version);
  return runtime;
}

async function verifyRuntime(runtime, session, { signal, stateDirectory } = {}) {
  const report = path.join(session, 'validation.json');
  await run(process.execPath, [path.join(__dirname, '../test/integration.cjs'),
    '--runtime', runtime, '--work', path.join(session, 'tests'), '--report', report,
    ...(stateDirectory ? ['--state-dir', stateDirectory] : [])],
  { log: path.join(session, 'validation.log'), signal, timeout: 5 * 60_000 });
  const result = JSON.parse(fs.readFileSync(report, 'utf8'));
  if (result.pass !== true || result.runtimeVersion !== validateRuntime(runtime).version ||
      path.resolve(result.runtime) !== path.resolve(runtime) || result.tests?.length < policy.minimumChecks ||
      !result.tests?.every(test => test.pass === true)) {
    throw new Error(`Incomplete language-service validation: ${report}`);
  }
  return report;
}

async function check(root, options = {}, dependencies = {}) {
  const releaseLock = acquireLock(root);
  if (!releaseLock) return { status: 'busy' };
  let state;
  let release, fingerprint, session, validating = false;
  try {
    state = loadState(root) || initialState(root, options.runtime);
    validateRuntime(state.active.path, state.active.version);
    saveState(root, state);
    if (options.automatic && !state.autoUpdate) return { status: 'paused', active: state.active.version };
    const now = Date.now();
    if (options.automatic && !options.force &&
        now - Date.parse(state.lastAttempt || '') < policy.checkIntervalHours * 3600_000) {
      return { status: 'not-due', active: state.active.version };
    }
    state.lastAttempt = new Date(now).toISOString();
    saveState(root, state);
    release = await (dependencies.getRelease || getRelease)(options.version, options.signal);
    versionParts(release.version);
    const comparison = compareVersions(release.version, state.active.version);
    if (comparison < 0 || (comparison === 0 && !options.revalidate)) {
      state.pendingRelease = null;
      state.lastResult = { status: 'current', available: release.version, at: new Date().toISOString() };
      saveState(root, state);
      return { ...state.lastResult, active: state.active.version };
    }
    fingerprint = (dependencies.fingerprint || bridgeFingerprint)();
    if (options.automatic && !options.force && state.failedCandidate?.version === release.version &&
        state.failedCandidate.sha256 === release.sha256 && state.failedCandidate.bridge === fingerprint) {
      return { status: 'previously-failed', version: release.version };
    }
    if (options.discoverOnly) {
      state.pendingRelease = release;
      state.lastResult = { status: 'available', version: release.version, at: new Date().toISOString() };
      saveState(root, state);
      return state.lastResult;
    }
    session = path.join(root, 'runtime-releases', `${release.version}-${randomUUID()}`);
    fs.mkdirSync(session, { recursive: true });
    fs.writeFileSync(path.join(session, 'before.json'), JSON.stringify(state, null, 2));
    fs.writeFileSync(path.join(session, 'release.json'), JSON.stringify(release, null, 2));
    const runtime = await (dependencies.stageRelease || stageRelease)(release, session, options);
    validateRuntime(runtime, release.version);
    validating = true;
    const report = await (dependencies.verifyRuntime || verifyRuntime)(runtime, session, options);
    options.signal?.throwIfAborted();
    // The lock spans discovery, download, testing and commit. A running editor
    // keeps its old processes; only the next launch reads this atomic selection.
    const nextState = structuredClone(state);
    activate(nextState, {
      version: release.version, path: runtime, sha256: release.sha256, source: release.url,
      validatedAt: new Date().toISOString(), bridge: fingerprint, report,
    });
    nextState.failedCandidate = null;
    nextState.pendingRelease = null;
    nextState.lastResult = { status: 'updated', version: release.version, at: new Date().toISOString(), report };
    fs.writeFileSync(path.join(session, 'after.json'), JSON.stringify(nextState, null, 2));
    saveState(root, nextState);
    return nextState.lastResult;
  } catch (error) {
    if (state) {
      state.lastResult = { status: 'failed', at: new Date().toISOString(), error: error.message, session };
      if (release && fingerprint && validating && !options.signal?.aborted) {
        state.failedCandidate = { version: release.version, sha256: release.sha256, bridge: fingerprint };
      }
      saveState(root, state);
    }
    throw error;
  } finally { releaseLock(); }
}

function configure(root, action, options = {}) {
  const releaseLock = acquireLock(root);
  if (!releaseLock) throw new Error('An update is running. Retry after it finishes.');
  try {
    const state = loadState(root) || initialState(root, options.runtime);
    if (action === 'rollback') {
      const target = state.history.find(entry => !options.version || entry.version === options.version);
      if (!target) throw new Error('No retained version is available for rollback.');
      validateRuntime(target.path, target.version);
      activate(state, target);
      state.autoUpdate = false;
      state.lastResult = { status: 'rolled-back', version: target.version, at: new Date().toISOString() };
    } else if (action === 'pause' || action === 'resume') {
      state.autoUpdate = action === 'resume';
      if (state.autoUpdate) state.lastAttempt = null;
    } else if (action !== 'init') throw new Error(`Unknown action: ${action}`);
    saveState(root, state);
    return state;
  } finally { releaseLock(); }
}

async function main() {
  const args = process.argv.slice(2);
  const action = args.shift();
  const value = name => {
    const index = args.indexOf(name);
    if (index < 0) return undefined;
    if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Missing ${name} value.`);
    return args[index + 1];
  };
  const rootArgument = value('--state-dir');
  if (!rootArgument || !path.isAbsolute(rootArgument)) throw new Error('Pass --state-dir <absolute extension work directory>.');
  const root = path.resolve(rootArgument);
  const controller = new AbortController();
  const cancel = () => controller.abort(new Error('The editor stopped the update check.'));
  process.on('disconnect', cancel);
  process.on('message', message => { if (message === 'cancel') cancel(); });
  let result;
  try {
    const options = {
      runtime: value('--runtime'), version: value('--version'), vsix: value('--vsix'),
      automatic: args.includes('--auto'), force: args.includes('--force'),
      revalidate: args.includes('--revalidate'), signal: controller.signal,
      discoverOnly: args.includes('--discover-only'),
    };
    if (action === 'status') result = loadState(root) || initialState(root, options.runtime);
    else if (action === 'check') result = await check(root, options);
    else result = configure(root, action, options);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } finally {
    process.off('disconnect', cancel);
    if (process.connected) process.disconnect();
  }
}

if (require.main === module) {
  main().catch(error => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
}

module.exports = { check, configure, getRelease, fileHash, stageRelease, verifyRuntime, bridgeFingerprint };

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { EventEmitter } = require('node:events');

const argument = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? fallback : process.argv[i + 1];
};
const runtime = argument('--runtime', process.env.UNIAPP_X_RUNTIME);
assert.ok(runtime, 'Pass --runtime <official DCloud extension directory>');
const runtimeVersion = JSON.parse(fs.readFileSync(path.join(runtime, 'package.json'), 'utf8')).version;
const reportPath = argument('--report');
const stateDirectory = argument('--state-dir');
const work = path.resolve(argument('--work', '.cache/tests'));
const session = path.join(work, `run-${Date.now()}`);
const project = path.join(session, 'project');
const fixtureFiles = ['sample.uts', 'pages/index/index.uvue', 'pages/options/options.uvue'];
fs.mkdirSync(session, { recursive: true });
fs.cpSync(path.join(__dirname, 'fixtures/demo'), project, { recursive: true });
for (const name of fixtureFiles) {
  const text = fs.readFileSync(path.join(project, name), 'utf8');
  assert.ok(text.includes('const count: number = "wrong"'),
    `${name}: fixed test fixture must retain its intentional type error`);
}
const traceFile = path.join(session, 'bridge.jsonl');
const stderrFile = path.join(session, 'stderr.log');
const serverArguments = stateDirectory
  ? [path.join(__dirname, '../server/launch.cjs'), '--stdio', '--state-dir', stateDirectory]
  : [path.join(__dirname, '../server/server.cjs'), '--stdio', '--runtime', runtime];
const child = spawn(process.execPath, serverArguments, {
  cwd: project, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, UNIAPP_X_TRACE: traceFile, UNIAPP_X_SKIP_UPDATE: '1' },
});
child.stderr.on('data', chunk => fs.appendFileSync(stderrFile, chunk));
let buffer = Buffer.alloc(0), seq = 0;
const pending = new Map(), diagnostics = new Map(), events = new EventEmitter();
const results = [];
const rpcLogs = [];
function write(message) {
  const body = Buffer.from(JSON.stringify(message));
  child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
  child.stdin.write(body);
}
function request(method, params) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, 30000);
    pending.set(id, { resolve, reject, timer });
    write({ jsonrpc: '2.0', id, method, params });
  });
}
const notify = (method, params) => write({ jsonrpc: '2.0', method, params });
child.on('error', error => { for (const p of pending.values()) { clearTimeout(p.timer); p.reject(error); } });
child.stdout.on('data', chunk => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    const end = buffer.indexOf('\r\n\r\n');
    if (end < 0) return;
    const match = /Content-Length:\s*(\d+)/i.exec(buffer.toString('ascii', 0, end));
    if (!match) throw new Error(`Invalid LSP output: ${buffer.toString().slice(0, 300)}`);
    const size = Number(match[1]);
    if (buffer.length < end + 4 + size) return;
    const msg = JSON.parse(buffer.toString('utf8', end + 4, end + 4 + size));
    buffer = buffer.subarray(end + 4 + size);
    if (msg.method === 'textDocument/publishDiagnostics') {
      diagnostics.set(msg.params.uri, msg.params);
      events.emit('diagnostics', msg.params);
    } else if (msg.method && msg.id !== undefined) {
      write({ jsonrpc: '2.0', id: msg.id, result: null });
    } else if (msg.id !== undefined) {
      const p = pending.get(msg.id);
      if (p) {
        pending.delete(msg.id);
        clearTimeout(p.timer);
        msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
      }
    } else if (msg.method?.startsWith('window/')) {
      rpcLogs.push(msg.params);
    }
  }
});
const uri = name => pathToFileURL(path.join(project, name)).href;
function position(text, offset) {
  const lines = text.slice(0, offset).split('\n');
  return { line: lines.length - 1, character: lines.at(-1).length };
}
function waitDiagnostics(targetUri, version, check, timeout = 20000) {
  const valid = data => data?.uri === targetUri && data.version === version && check(data.diagnostics);
  const present = diagnostics.get(targetUri);
  if (valid(present)) return Promise.resolve(present);
  return new Promise((resolve, reject) => {
    const listener = data => {
      if (valid(data)) {
        clearTimeout(timer); events.off('diagnostics', listener); resolve(data);
      }
    };
    const timer = setTimeout(() => {
      events.off('diagnostics', listener);
      reject(new Error(`Diagnostics timeout: ${targetUri} v${version}\n${JSON.stringify(diagnostics.get(targetUri))}`));
    }, timeout);
    events.on('diagnostics', listener);
  });
}
const hasTypeError = list => list.some(d => d.code === 2322);
function record(name, detail = {}) {
  results.push({ detail, name, pass: true });
  console.log(`PASS ${name}`);
}

(async () => {
  const initialized = await request('initialize', {
    processId: process.pid, rootUri: pathToFileURL(project).href,
    workspaceFolders: [{ uri: pathToFileURL(project).href, name: 'integration' }],
    capabilities: { textDocument: { publishDiagnostics: { versionSupport: true }, completion: {
      completionItem: { snippetSupport: true },
    } }, workspace: { didChangeWatchedFiles: { dynamicRegistration: true } } },
    initializationOptions: { targets: ['APP-ANDROID'] },
  });
  assert.ok(initialized.capabilities.completionProvider);
  const expectedData = stateDirectory
    ? path.join(stateDirectory, 'service-data') : path.join(path.dirname(runtime), 'data');
  const indexCache = process.platform === 'darwin'
    ? path.join(expectedData, 'Library', 'Application Support', 'HBuilder X')
    : path.join(expectedData, 'HBuilder X');
  assert.ok(fs.statSync(indexCache).isDirectory(), 'index cache must stay with the managed runtime');
  const initializationTrace = fs.readFileSync(traceFile, 'utf8').trim().split('\n')
    .map(line => JSON.parse(line)).find(entry => entry.event === 'initialize');
  assert.equal(path.resolve(initializationTrace.dataRoot), path.resolve(expectedData));
  notify('initialized', {});
  record('LSP initialize with official DCloud runtime', initialized.serverInfo);
  for (const name of fixtureFiles) {
    const original = fs.readFileSync(path.join(project, name), 'utf8');
    const fileUri = uri(name);
    notify('textDocument/didOpen', { textDocument: {
      uri: fileUri, languageId: name.endsWith('.uvue') ? 'uvue' : 'uts', version: 1, text: original,
    } });
    const cursor = position(original, original.indexOf('uni.request') + 4);
    const completion = await request('textDocument/completion', { textDocument: { uri: fileUri }, position: cursor });
    const item = completion.items.find(item => item.label === 'request');
    assert.ok(item, `${name}: missing official uni.request completion`);
    record(`${name}: uni API completion`, { count: completion.items.length });
    const resolved = await request('completionItem/resolve', item);
    assert.ok(resolved.detail?.includes('request'));
    record(`${name}: completion details`, { detail: resolved.detail.slice(0, 160) });
    const call = position(original, original.indexOf('greet("Zed")') + 2);
    const definitions = await request('textDocument/definition', { textDocument: { uri: fileUri }, position: call });
    assert.ok(definitions.some(d => d.uri.endsWith('/utils/greet.uts') && d.range.start.line === 0));
    record(`${name}: cross-file definition`);
    const hover = await request('textDocument/hover', { textDocument: { uri: fileUri }, position: call });
    assert.ok(hover?.contents?.value.includes('greet'));
    record(`${name}: hover`);
    const errors = await waitDiagnostics(fileUri, 1, hasTypeError);
    const error = errors.diagnostics.find(d => d.code === 2322);
    assert.equal(error.range.start.line, position(original, original.indexOf('const count')).line);
    record(`${name}: official type diagnostic and source position`, { diagnostic: error });
    const corrected = original.replace('number = "wrong"', 'number = 42');
    notify('textDocument/didChange', {
      textDocument: { uri: fileUri, version: 2 }, contentChanges: [{ text: corrected }],
    });
    const clean = await waitDiagnostics(fileUri, 2, list => !hasTypeError(list));
    assert.equal(clean.diagnostics.filter(d => d.severity === 1).length, 0, JSON.stringify(clean));
    record(`${name}: diagnostic clears after unsaved edit`);
    const apiCall = position(corrected, corrected.indexOf('uni.request') + 6);
    const apiDef = await request('textDocument/definition', { textDocument: { uri: fileUri }, position: apiCall });
    assert.ok(apiDef.some(d => d.uri.includes('builtin-dts') || d.uri.includes('uni-api')));
    record(`${name}: official uni API definition`);
    notify('textDocument/didClose', { textDocument: { uri: fileUri } });
  }

  // An astral character occupies two UTF-16 code units. Use CRLF and rapid
  // didChange before didOpen has finished to exercise both synchronization paths.
  const rapidUri = uri('rapid.uts');
  const rapidText = 'const emoji = "😀"; const amount: number = "bad"\r\nuni.request({ url: "https://example.com" })\r\n';
  notify('textDocument/didOpen', { textDocument: { uri: rapidUri, languageId: 'uts', version: 1, text: rapidText } });
  notify('textDocument/didChange', {
    textDocument: { uri: rapidUri, version: 2 },
    contentChanges: [{ range: {
      start: position(rapidText, rapidText.indexOf('"bad"')),
      end: position(rapidText, rapidText.indexOf('"bad"') + 5),
    }, text: '100' }],
  });
  await waitDiagnostics(rapidUri, 2, list => list.every(d => d.severity !== 1));
  record('incremental range edit after emoji clears type error without full resync');
  // Send a full-content final revision to ensure old diagnostics cannot overwrite it.
  const rapidFinal = rapidText.replace('"bad"', '100');
  notify('textDocument/didChange', { textDocument: { uri: rapidUri, version: 3 }, contentChanges: [{ text: rapidFinal }] });
  await waitDiagnostics(rapidUri, 3, list => list.every(d => d.severity !== 1));
  record('rapid updates, CRLF and UTF-16 synchronize without stale diagnostics');
  notify('textDocument/didChange', { textDocument: { uri: rapidUri, version: 4 }, contentChanges: [{ text: rapidText }] });
  const unicodeErrors = await waitDiagnostics(rapidUri, 4, hasTypeError);
  assert.equal(unicodeErrors.diagnostics.find(d => d.code === 2322).range.start.character, rapidText.indexOf('amount'));
  record('UTF-16 diagnostic column after emoji');
  notify('textDocument/didClose', { textDocument: { uri: rapidUri } });
  await request('shutdown', null);
  notify('exit', {});
  await new Promise(resolve => {
    if (child.exitCode !== null) return resolve();
    child.once('exit', resolve);
    setTimeout(() => { child.kill(); resolve(); }, 3000).unref();
  });
  assert.equal(child.exitCode, 0, 'LSP must exit normally after shutdown/exit');
  record('clean LSP shutdown');
  const report = { pass: true, runtimeVersion, runtime: path.resolve(runtime), tests: results, logs: rpcLogs, session };
  fs.writeFileSync(path.join(session, 'report.json'), JSON.stringify(report, null, 2));
  if (reportPath) fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`RESULT ${results.length} checks passed\nREPORT ${path.join(session, 'report.json')}`);
})().catch(error => {
  const report = { pass: false, runtimeVersion, error: error.stack, tests: results, logs: rpcLogs };
  fs.writeFileSync(path.join(session, 'report.json'), JSON.stringify(report, null, 2));
  if (reportPath) fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.error(error.stack, `\nREPORT ${path.join(session, 'report.json')}`);
  process.exitCode = 1;
}).finally(() => {
  if (child.exitCode === null) child.kill();
  for (const p of pending.values()) clearTimeout(p.timer);
});

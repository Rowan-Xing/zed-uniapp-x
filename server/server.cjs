#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { pathToFileURL, fileURLToPath } = require('node:url');
const { TsClient } = require('./ts-client.cjs');
const { validateRuntime } = require('./runtime-store.cjs');
const { startAutoUpdate } = require('./auto-update.cjs');

const runtimeArg = process.argv.indexOf('--runtime');
const runtime = path.resolve(runtimeArg >= 0 ? process.argv[runtimeArg + 1] : process.env.UNIAPP_X_RUNTIME || '');
let runtimePackage;
try {
  runtimePackage = validateRuntime(runtime);
} catch (error) {
  process.stderr.write(`uni-app x: invalid runtime at ${runtime}: ${error.message}\n`);
  process.exit(1);
}
const lsp = require(path.join(runtime, 'node_modules/vscode-languageserver/node'));
const rpc = require(path.join(runtime, 'node_modules/vscode-jsonrpc/node'));
const { TextDocument } = require(path.join(runtime, 'node_modules/vscode-languageserver-textdocument'));
const connection = lsp.createConnection(lsp.ProposedFeatures.all);
const documents = new lsp.TextDocuments(TextDocument);
let ts, indexChild, indexConnection, root, folders, settings = {}, shuttingDown = false;
let dynamicFileWatching = false;
let queue = Promise.resolve();
let diagnosticTimer;
let diagnosticRun;
let stopAutoUpdate;
const dirty = new Set();
const queuedVersions = new Map();
const appliedTargets = new Set();
const tracePath = process.env.UNIAPP_X_TRACE;
const normalize = file => path.resolve(file).replaceAll('\\', '/').toLowerCase();
const toUri = file => pathToFileURL(path.resolve(file)).href;
const toFile = uri => fileURLToPath(uri);
const trace = (event, data = {}) => {
  if (!tracePath) return;
  try { fs.appendFileSync(tracePath, JSON.stringify({ time: new Date().toISOString(), event, ...data }) + '\n'); }
  catch { /* Optional tracing must not stop the service. */ }
};
const log = message => { connection.console.log(String(message).slice(0, 1800)); };
const serialize = task => {
  const result = queue.then(task);
  queue = result.catch(error => {
    if (shuttingDown) return;
    connection.console.error(error.message);
    trace('error', { message: error.message });
  });
  return result;
};
function position(value) {
  return { line: Math.max(0, value.line - 1), character: Math.max(0, value.offset - 1) };
}
function range(start, end) { return { start: position(start), end: position(end) }; }
function textParts(parts) {
  return typeof parts === 'string' ? parts : Array.isArray(parts) ? parts.map(p => p.text || '').join('') : '';
}
function locationSpan(span, document) {
  if (typeof span?.start === 'number') return {
    start: document.positionAt(span.start), end: document.positionAt(span.start + span.length),
  };
  if (span?.start && span?.end) return range(span.start, span.end);
}
function languageId(document) { return document.uri.endsWith('.uvue') ? 'uvue' : 'uts'; }
function projectRoot(file) {
  let cursor = path.dirname(file);
  while (cursor.length >= root.length) {
    if (fs.existsSync(path.join(cursor, 'manifest.json')) && fs.existsSync(path.join(cursor, 'pages.json'))) {
      // For CLI projects DCloud expects the directory above src as the root.
      if (path.basename(cursor) === 'src' && fs.existsSync(path.join(path.dirname(cursor), 'package.json'))) {
        return path.dirname(cursor);
      }
      return cursor;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return root;
}
function indexNotify(method, args) {
  if (indexConnection) indexConnection.sendNotification(method, args);
}
function collectIndexProcessors() {
  return ['jsservice', 'styleservice', 'htmlservice', 'vueservice', 'stylusservice', 'independentIndexer']
    .flatMap(name => {
      const manifest = JSON.parse(fs.readFileSync(path.join(runtime, name, 'package.json'), 'utf8'));
      return (manifest.contributes?.indexProcessors || [])
        .map(item => ({ ...item, url: path.resolve(runtime, name, item.url) }));
    });
}
async function startIndex(pipeName) {
  indexChild = spawn(process.execPath, [
    path.join(runtime, 'indexservice/out/server/server.js'), '--stdio',
  ], { cwd: root, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  indexChild.stderr.on('data', chunk => log(`Index: ${chunk}`));
  indexChild.on('error', error => log(`Index failed: ${error.message}`));
  indexConnection = rpc.createMessageConnection(
    new rpc.StreamMessageReader(indexChild.stdout),
    new rpc.StreamMessageWriter(indexChild.stdin),
  );
  indexConnection.onRequest('client/registerCapability', () => null);
  indexConnection.onNotification('window/logMessage', message => trace('index-log', { message: message.message }));
  indexConnection.onError(error => log(`Index connection: ${error}`));
  indexConnection.listen();
  await indexConnection.sendRequest('initialize', {
    processId: process.pid, rootUri: toUri(root), workspaceFolders: folders,
    capabilities: { workspace: { workspaceFolders: true } },
    initializationOptions: {
      pipeName, indexProcessors: collectIndexProcessors(), processId: process.pid,
      configList: { 'logger.logLevel': 'normal', 'logger.logType': ['error'] },
    },
  });
  indexNotify('initialized', {});
}
async function configure() {
  const masks = Object.fromEntries(['APP-ANDROID', 'APP-IOS', 'APP-HARMONY', 'WEB', 'MP-WEIXIN'].map(t => [t, 63]));
  await ts.request('configure', {
    hostInfo: 'hbuilder',
    preferences: {
      includeCompletionsForModuleExports: true,
      includeCompletionsWithInsertText: true,
      includeCompletionsWithSnippetText: true,
      allowRenameOfImportPath: true,
      '@workspace/typescript.validate.enable': settings.diagnostics !== false,
      '@workspace/javascript.validate.enable': settings.diagnostics !== false,
      '@workspace/uniappx.validate.settings': settings.diagnostics === false
        ? Object.fromEntries(Object.keys(masks).map(t => [t, 0])) : masks,
    },
    extraFileExtensions: ['.vue', '.uvue', '.nvue', '.uts'].map(extension => ({
      extension, isMixedContent: false, scriptKind: 7,
    })),
  });
  await ts.request('compilerOptionsForInferredProjects', {
    options: { module: 'commonjs', target: 'ESNext', jsx: 'preserve', allowJs: true,
      allowNonTsExtensions: true, allowSyntheticDefaultImports: true, resolveJsonModule: true },
  });
}
function scheduleDiagnostics() {
  if (shuttingDown) return;
  clearTimeout(diagnosticTimer);
  diagnosticTimer = setTimeout(() => {
    serialize(async () => {
      const targets = [...dirty].map(uri => documents.get(uri)).filter(Boolean);
      dirty.clear();
      if (!targets.length) return;
      if (settings.diagnostics === false) {
        for (const document of targets) connection.sendDiagnostics({ uri: document.uri, version: document.version, diagnostics: [] });
        return;
      }
      diagnosticRun = new Map(targets.map(document => [
        normalize(toFile(document.uri)), { uri: document.uri, version: document.version, kinds: new Map() },
      ]));
      const run = diagnosticRun;
      try {
        await ts.request('geterr', { files: targets.map(d => toFile(d.uri)), delay: 0 });
        for (const result of run.values()) {
          if (documents.get(result.uri)?.version !== result.version) continue;
          const diagnostics = [...result.kinds.values()].flat();
          connection.sendDiagnostics({ uri: result.uri, version: result.version, diagnostics });
          trace('diagnostics', { uri: result.uri, version: result.version, codes: diagnostics.map(d => d.code) });
        }
      } finally { if (diagnosticRun === run) diagnosticRun = undefined; }
    }).catch(() => {});
  }, 300);
}
function receiveEvent(message) {
  if (!['syntaxDiag', 'semanticDiag', 'suggestionDiag'].includes(message.event)) return;
  const record = diagnosticRun?.get(normalize(message.body.file));
  if (!record) return;
  const diagnostics = (message.body.diagnostics || []).map(d => ({
    range: range(d.start, d.end),
    message: (typeof d.text === 'string' ? d.text : d.text?.messageText || 'Type error')
      + (d.target ? `\n${d.target.replace('[target]', '')}` : ''),
    severity: d.category === 'error' ? 1 : d.category === 'warning' ? 2 : d.category === 'suggestion' ? 4 : 3,
    code: d.code, source: 'uni-app x',
    ...(d.reportsUnnecessary ? { tags: [1] } : {}),
  }));
  record.kinds.set(message.event, diagnostics);
}
async function openDocument(document) {
  const file = toFile(document.uri);
  const folder = projectRoot(file);
  await ts.request('updateOpen', { openFiles: [{
    file, fileContent: document.getText(), projectRootPath: folder,
    languageId: languageId(document), plugins: ['dcloudio'],
  }] });
  indexNotify('textDocument/didOpen', {
    textDocument: { uri: document.uri, languageId: languageId(document), version: document.version, text: document.getText() },
  });
  if (Array.isArray(settings.targets) && settings.targets.length && !appliedTargets.has(folder)) {
    await ts.request('onTargetChanged', { projectPath: folder, targets: settings.targets });
    appliedTargets.add(folder);
  }
}

connection.onInitialize(async params => {
  root = params.rootUri ? toFile(params.rootUri) : params.rootPath || process.cwd();
  folders = params.workspaceFolders || [{ uri: toUri(root), name: path.basename(root) }];
  settings = params.initializationOptions || {};
  dynamicFileWatching = !!params.capabilities.workspace?.didChangeWatchedFiles?.dynamicRegistration;
  const pipeName = process.platform === 'win32'
    ? `\\\\.\\pipe\\zed-uniapp-x-${process.pid}`
    : path.join(os.tmpdir(), `zed-uniapp-x-${process.pid}.sock`);
  await startIndex(pipeName);
  ts = new TsClient(runtime, {
    root, pipeName, dataDir: path.join(path.dirname(runtime), 'data'), locale: settings.locale,
    version: runtimePackage.version,
  });
  ts.on('event', receiveEvent);
  ts.on('log', log);
  ts.on('fatal', error => {
    connection.sendNotification('window/showMessage', { type: 1, message: `${error.message} Run “Restart Language Server” to retry.` });
  });
  await configure();
  trace('initialize', { root, runtime, version: runtimePackage.version, targets: settings.targets || 'platformConfig.json' });
  return {
    serverInfo: { name: 'uni-app x (DCloud local bridge)', version: '0.2.0' },
    capabilities: {
      textDocumentSync: { openClose: true, change: lsp.TextDocumentSyncKind.Incremental, save: { includeText: false } },
      completionProvider: { triggerCharacters: ['.', '"', "'", '/', '<', ':', '@'], resolveProvider: true },
      definitionProvider: true, hoverProvider: true,
      referencesProvider: true,
    },
  };
});
connection.onInitialized(async () => {
  const stateIndex = process.argv.indexOf('--state-dir');
  if (process.argv.includes('--managed-runtime') && stateIndex >= 0 &&
      settings.autoUpdate !== false && process.env.UNIAPP_X_SKIP_UPDATE !== '1') {
    stopAutoUpdate = startAutoUpdate(process.argv[stateIndex + 1], log, result => {
      connection.sendNotification('window/showMessage', {
        type: 3,
        message: `DCloud ${result.version} passed all runtime checks and is ready. Restart the language server to use it. The previous version was retained for rollback.`,
      });
    });
  }
  if (!dynamicFileWatching) return;
  try {
    await connection.client.register(lsp.DidChangeWatchedFilesNotification.type, {
      watchers: [{ globPattern: '**/*.{uts,uvue,vue,json}', kind: 7 }],
    });
  } catch (error) { log(`File watcher registration: ${error.message}`); }
});
documents.onDidOpen(({ document }) => {
  // Capture text now, before a subsequent didChange mutates the TextDocument.
  const snapshot = TextDocument.create(document.uri, document.languageId, document.version, document.getText());
  queuedVersions.set(document.uri, document.version);
  serialize(() => openDocument(snapshot)).then(() => {
    dirty.add(document.uri); scheduleDiagnostics();
  }).catch(() => {});
});
documents.onDidChangeContent(({ document }) => {
  if (queuedVersions.get(document.uri) === document.version) return;
  queuedVersions.set(document.uri, document.version);
  const file = toFile(document.uri), text = document.getText(), version = document.version;
  serialize(async () => {
    // updateOpen with the full current content avoids offset errors for CRLF and
    // surrogate pairs while retaining DCloud's existing project and script info.
    await ts.request('updateOpen', { openFiles: [{
      file, fileContent: text, projectRootPath: projectRoot(file),
      languageId: languageId(document), plugins: ['dcloudio'],
    }] });
    indexNotify('textDocument/didChange', { textDocument: { uri: document.uri, version }, contentChanges: [{ text }] });
    for (const open of documents.all()) dirty.add(open.uri);
    scheduleDiagnostics();
  }).catch(() => {});
});
documents.onDidClose(({ document }) => {
  queuedVersions.delete(document.uri);
  dirty.delete(document.uri);
  connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
  serialize(async () => {
    await ts.request('updateOpen', { closedFiles: [toFile(document.uri)] });
    indexNotify('textDocument/didClose', { textDocument: { uri: document.uri } });
  }).catch(() => {});
});
documents.onDidSave(({ document }) => {
  indexNotify('workspace/didChangeWatchedFiles', { changes: [{ uri: document.uri, type: 2 }] });
  for (const open of documents.all()) dirty.add(open.uri);
  scheduleDiagnostics();
});
connection.onDidChangeWatchedFiles(params => {
  indexNotify('workspace/didChangeWatchedFiles', params);
  serialize(async () => {
    await ts.request('reloadProjects', {});
    for (const document of documents.all()) dirty.add(document.uri);
    scheduleDiagnostics();
  }).catch(() => {});
});
connection.onDidChangeConfiguration(params => {
  settings = { ...settings, ...(params.settings?.['uniapp-x'] || params.settings || {}) };
  serialize(async () => {
    await configure();
    if (Array.isArray(settings.targets) && settings.targets.length) {
      for (const folder of new Set(documents.all().map(d => projectRoot(toFile(d.uri))))) {
        await ts.request('onTargetChanged', { projectPath: folder, targets: settings.targets });
      }
    }
    for (const document of documents.all()) dirty.add(document.uri);
    scheduleDiagnostics();
  }).catch(() => {});
});
const completionKinds = {
  method: 2, function: 3, constructor: 4, property: 10, getter: 10, setter: 10,
  var: 6, let: 6, const: 21, class: 7, interface: 8, module: 9,
  enum: 13, 'enum member': 20, keyword: 14, alias: 6, type: 25,
  script: 17, directory: 19, string: 12, 'local var': 6, 'local function': 3,
};
connection.onCompletion(params => serialize(async () => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;
  const file = toFile(document.uri);
  const query = { file, line: params.position.line + 1, offset: params.position.character + 1,
    includeExternalModuleExports: true, includeInsertTextCompletions: true };
  let result;
  try { result = await ts.request('completionInfo', query); }
  catch (error) { if (/No content available/.test(error.message)) return null; throw error; }
  const items = (result?.entries || []).map(entry => {
    const editRange = locationSpan(entry.replacementSpan || result.optionalReplacementSpan, document);
    const item = {
      label: entry.name, kind: completionKinds[entry.kind] || 1, sortText: entry.sortText,
      insertText: entry.insertText || entry.name, insertTextFormat: entry.isSnippet ? 2 : 1,
      data: { ...query, name: entry.name, source: entry.source, entryData: entry.data, uri: document.uri, version: document.version },
    };
    if (entry.kindModifiers?.includes('deprecated')) item.tags = [1];
    if (editRange) item.textEdit = { range: editRange, newText: item.insertText };
    return item;
  });
  trace('completion', { uri: document.uri, count: items.length, hasRequest: items.some(i => i.label === 'request') });
  return { isIncomplete: !!result?.isIncomplete, items };
}));
connection.onCompletionResolve(item => serialize(async () => {
  const data = item.data;
  if (!data || documents.get(data.uri)?.version !== data.version) return item;
  const result = await ts.request('completionEntryDetails', {
    file: data.file, line: data.line, offset: data.offset,
    entryNames: [{ name: data.name, source: data.source, data: data.entryData }],
  });
  const details = result?.[0];
  if (!details) return item;
  item.detail = textParts(details.displayParts);
  item.documentation = { kind: 'markdown', value: textParts(details.documentation) };
  // Only edits to the active document can be represented as additionalTextEdits.
  const doc = documents.get(data.uri);
  item.additionalTextEdits = (details.codeActions || []).flatMap(action => action.changes || [])
    .filter(change => normalize(change.fileName) === normalize(data.file))
    .flatMap(change => change.textChanges.map(edit => ({
      range: edit.start ? range(edit.start, edit.end) : locationSpan(edit.span, doc),
      newText: edit.newText,
    }))).filter(edit => edit.range);
  return item;
}));
connection.onDefinition(params => serialize(async () => {
  const result = await ts.request('definitionAndBoundSpan', {
    file: toFile(params.textDocument.uri), line: params.position.line + 1, offset: params.position.character + 1,
  });
  const locations = (result?.definitions || []).map(d => ({ uri: toUri(d.file), range: range(d.start, d.end) }));
  trace('definition', { uri: params.textDocument.uri, targets: locations.map(l => l.uri) });
  return locations;
}));
connection.onHover(params => serialize(async () => {
  let result;
  try {
    result = await ts.request('quickinfo', {
      file: toFile(params.textDocument.uri), line: params.position.line + 1, offset: params.position.character + 1,
    });
  } catch (error) { if (/No content available/.test(error.message)) return null; throw error; }
  if (!result) return null;
  return { range: range(result.start, result.end), contents: {
    kind: 'markdown', value: '```typescript\n' + result.displayString + '\n```\n' + textParts(result.documentation),
  } };
}));
connection.onReferences(params => serialize(async () => {
  const result = await ts.request('references', {
    file: toFile(params.textDocument.uri), line: params.position.line + 1, offset: params.position.character + 1,
  });
  return (result?.refs || []).filter(ref => params.context.includeDeclaration || !ref.isDefinition)
    .map(ref => ({ uri: toUri(ref.file), range: range(ref.start, ref.end) }));
}));
function stop() {
  if (shuttingDown) return;
  shuttingDown = true;
  clearTimeout(diagnosticTimer);
  stopAutoUpdate?.();
  ts?.stop();
  indexConnection?.dispose();
  indexChild?.kill();
  trace('shutdown');
}
connection.onShutdown(() => { stop(); return null; });
connection.onExit(() => { stop(); process.exit(0); });
process.on('exit', stop);
process.on('SIGTERM', () => { stop(); process.exit(0); });
process.on('SIGINT', () => { stop(); process.exit(0); });
process.stdin.on('end', () => { stop(); process.exit(0); });
documents.listen(connection);
connection.listen();

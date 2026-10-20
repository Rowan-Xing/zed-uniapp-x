'use strict';

const { EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');
const path = require('node:path');

class TsClient extends EventEmitter {
  constructor(runtime, options) {
    super();
    this.seq = 0;
    this.pending = new Map();
    this.buffer = Buffer.alloc(0);
    this.stopped = false;
    const args = [
      '--require', path.join(__dirname, 'dcloud-compat.cjs'),
      path.join(runtime, 'node_modules/typescript/lib/tsserver.js'),
      '--globalPlugins', 'dcloudio',
      '--pluginProbeLocations', path.join(runtime, 'jsservice/out/tsplugins'),
      '--useInferredProjectPerProjectRoot',
      '--disableAutomaticTypingAcquisition',
      '--indexServerType', 'semantic',
      '--indexServerPipeName', options.pipeName,
      '--clientProcessId', String(process.pid),
      '--appVersion', options.version,
      '--locale', options.locale || 'en',
      '--vscodeEnvAppData', options.dataDir,
    ];
    this.child = spawn(process.execPath, args, {
      cwd: options.root,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, UNIAPP_X_DCLOUD_VERSION: options.version },
    });
    this.child.stderr.on('data', chunk => this.emit('log', chunk.toString()));
    this.child.stdout.on('data', chunk => this.read(chunk));
    this.child.stdin.on('error', error => this.fail(error));
    this.child.on('error', error => this.fail(error));
    this.child.on('exit', (code, signal) => {
      this.fail(new Error(`DCloud tsserver exited (${code ?? signal}).`));
    });
  }

  fail(error) {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.pending.clear();
    if (!this.stopped) {
      this.stopped = true;
      this.emit('fatal', error);
    }
  }

  read(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length) {
      const start = this.buffer.indexOf('Content-Length: ');
      if (start < 0) {
        if (this.buffer.length > 65536) {
          this.emit('log', this.buffer.toString().slice(0, 1000));
          this.buffer = Buffer.alloc(0);
        }
        return;
      }
      if (start > 0) {
        const text = this.buffer.subarray(0, start).toString().trim();
        if (text) this.emit('log', text);
        this.buffer = this.buffer.subarray(start);
      }
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) return;
      const match = /Content-Length:\s*(\d+)/i.exec(this.buffer.toString('ascii', 0, headerEnd));
      const length = Number(match?.[1]);
      if (!Number.isSafeInteger(length) || length > 32 * 1024 * 1024) {
        this.fail(new Error('Invalid tsserver message header.'));
        this.stop();
        return;
      }
      if (this.buffer.length < headerEnd + 4 + length) return;
      const body = this.buffer.toString('utf8', headerEnd + 4, headerEnd + 4 + length);
      this.buffer = this.buffer.subarray(headerEnd + 4 + length);
      let message;
      try { message = JSON.parse(body); }
      catch (error) { this.fail(error); this.stop(); return; }
      if (message.type === 'event') this.emit('event', message);
      const id = message.type === 'response' ? message.request_seq
        : message.event === 'requestCompleted' ? message.body.request_seq : undefined;
      const entry = this.pending.get(id);
      if (entry) {
        this.pending.delete(id);
        clearTimeout(entry.timer);
        if (message.success === false) entry.reject(new Error(message.message || `Failed: ${entry.command}`));
        else entry.resolve(message.body);
      }
    }
  }

  request(command, args = {}, timeoutMs = 30000) {
    if (this.stopped) return Promise.reject(new Error('DCloud language service is not running.'));
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`DCloud request timed out: ${command}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, command });
      this.child.stdin.write(JSON.stringify({
        seq: id, type: 'request', command, arguments: args,
      }) + '\n');
    });
  }

  stop() {
    this.stopped = true;
    this.fail(new Error('Language service stopped.'));
    this.child.kill();
  }
}

module.exports = { TsClient };

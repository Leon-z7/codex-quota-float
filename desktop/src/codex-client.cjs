'use strict';
const { EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const readline = require('node:readline');

function resolveCommand() {
  if (process.platform !== 'win32') return { command: 'codex', shell: false };
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  // Prefer the native executable: no command window or orphaned cmd.exe wrapper.
  for (const dir of dirs) {
    const binary = path.join(dir.replace(/^"|"$/g, ''), 'codex.exe');
    if (existsSync(binary)) return { command: binary, shell: false };
  }
  for (const dir of dirs) {
    const root = path.join(dir, 'node_modules', '@openai', 'codex');
    if (!existsSync(path.join(root, 'package.json'))) continue;
    const target = process.arch === 'arm64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc';
    let vendor = path.join(root, 'vendor');
    try {
      const nativePackage = createRequire(path.join(root, 'package.json')).resolve('@openai/codex-win32-' + process.arch + '/package.json');
      vendor = path.join(path.dirname(nativePackage), 'vendor');
    } catch {}
    for (const folder of ['bin', 'codex']) {
      const binary = path.join(vendor, target, folder, 'codex.exe');
      if (existsSync(binary)) return { command: binary, shell: false };
    }
  }
  // Fixed command only; no user-supplied paths or arguments enter a shell.
  return { command: 'codex', shell: true };
}
class CodexClient extends EventEmitter {
  constructor({ command, spawnImpl = spawn, timeoutMs = 15000 } = {}) {
    super();
    this.launch = command ? { command, shell: false } : resolveCommand();
    this.spawnImpl = spawnImpl;
    this.timeoutMs = timeoutMs;
    this.proc = null;
    this.pending = new Map();
    this.nextId = 1;
    this.refreshTimer = null;
    this.ready = false;
    this.closing = false;
    this.starting = null;
    this.lines = null;
  }
  start() {
    if (this.ready) return Promise.resolve();
    if (this.starting) return this.starting;
    this.closing = false;
    this.starting = this._start().finally(() => { this.starting = null; });
    return this.starting;
  }
  async _start() {
    const proc = this.spawnImpl(this.launch.command, ['app-server'], {
      stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, shell: this.launch.shell,
    });
    this.proc = proc;
    const fail = error => {
      if (this.proc !== proc || this.closing) return;
      this._disconnect(error, proc);
      this.emit('status', { level: 'error', message: error.message });
    };
    proc.once('error', error => fail(new Error('无法启动 Codex CLI：' + error.message)));
    proc.once('exit', code => fail(new Error('Codex 连接已断开（' + (code ?? '未知') + '）')));
    this.lines = readline.createInterface({ input: proc.stdout });
    this.lines.on('line', line => { if (this.proc === proc) this._handleLine(line); });
    // Drain stderr, but never expose arbitrary logs that might contain account details.
    proc.stderr.on('data', () => {});
    proc.stdin.on('error', error => fail(new Error('Codex 通信中断：' + error.code)));
    try {
      await this.request('initialize', { clientInfo: { name: 'codex_quota_float', title: 'Codex Quota Float', version: '0.2.1' } });
      this.notify('initialized', {});
      await this.refresh();
      if (this.proc !== proc) throw new Error('Codex 连接已关闭');
      this.ready = true;
    } catch (error) {
      this._disconnect(error, proc);
      throw error;
    }
  }
  request(method, params) {
    if (!this.proc?.stdin?.writable) return Promise.reject(new Error('Codex 尚未连接'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { this.pending.delete(id); reject(new Error(method + ' 请求超时')); }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
      try { this._write({ method, id, ...(params == null ? {} : { params }) }); }
      catch (error) { clearTimeout(timeout); this.pending.delete(id); reject(error); }
    });
  }
  notify(method, params) { this._write({ method, params }); }
  async refresh() {
    const proc = this.proc;
    const result = await this.request('account/rateLimits/read');
    if (this.proc !== proc) throw new Error('Codex 连接已关闭');
    const snapshot = normalizeRateLimits(result);
    if (!snapshot.buckets.length) throw new Error('未返回套餐额度，请确认 Codex CLI 使用 ChatGPT 账户登录');
    this.emit('snapshot', snapshot);
    return snapshot;
  }
  _write(message) {
    if (!this.proc?.stdin?.writable) throw new Error('Codex 连接已关闭');
    this.proc.stdin.write(JSON.stringify(message) + '\n');
  }
  _handleLine(line) {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (!message || typeof message !== 'object') return;
    if (Number.isInteger(message.id) && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id); clearTimeout(pending.timeout);
      if (message.error) pending.reject(new Error(message.error.message || 'Codex 请求失败'));
      else pending.resolve(message.result || {});
      return;
    }
    if (message.method === 'account/rateLimits/updated' && this.ready) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = setTimeout(() => {
        this.refresh().catch(error => this.emit('status', { level: 'error', message: error.message }));
      }, 500);
    }
  }
  _rejectAll(error) {
    for (const pending of this.pending.values()) { clearTimeout(pending.timeout); pending.reject(error); }
    this.pending.clear();
  }
  _disconnect(error, proc = this.proc) {
    if (!proc || this.proc !== proc) return;
    // Detach the old process before killing it: exit/error events and late
    // stdout must never affect a later connection.
    this.proc = null; this.ready = false;
    clearTimeout(this.refreshTimer); this.refreshTimer = null;
    this._rejectAll(error);
    this.lines?.close(); this.lines = null;
    proc.kill();
  }
  close() {
    this.closing = true; this.ready = false;
    this._disconnect(new Error('Codex 连接已关闭'));
  }
}
function normalizeRateLimits(result, now = new Date()) {
  const map = result?.rateLimitsByLimitId;
  const entries = map && typeof map === 'object' && !Array.isArray(map) && Object.keys(map).length
    ? Object.entries(map) : result?.rateLimits ? [[result.rateLimits.limitId || 'codex', result.rateLimits]] : [];
  return {
    buckets: entries.filter(([, value]) => value && typeof value === 'object').map(([id, value]) => ({
      limitId: id, limitName: typeof value.limitName === 'string' ? value.limitName : id,
      primary: normalizeWindow(value.primary), secondary: normalizeWindow(value.secondary),
    })).filter(bucket => bucket.primary || bucket.secondary),
    planType: typeof result?.planType === 'string' ? result.planType : null,
    updatedAt: now.toISOString(),
  };
}
function normalizeWindow(value) {
  // Missing/invalid usage is unknown, never "100% available".
  if (!value || typeof value !== 'object' || typeof value.usedPercent !== 'number' || !Number.isFinite(value.usedPercent)) return null;
  return {
    usedPercent: Math.max(0, Math.min(100, value.usedPercent)),
    windowDurationMins: Number.isFinite(value.windowDurationMins) && value.windowDurationMins > 0 ? value.windowDurationMins : 0,
    resetsAt: Number.isFinite(value.resetsAt) && value.resetsAt > 0 ? value.resetsAt : null,
  };
}
module.exports = { CodexClient, normalizeRateLimits, resolveCommand };


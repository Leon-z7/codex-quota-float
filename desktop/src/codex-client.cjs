'use strict';

const { EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');
const readline = require('node:readline');

class CodexClient extends EventEmitter {
  constructor({ command = 'codex', spawnImpl = spawn } = {}) {
    super();
    this.command = command;
    this.spawnImpl = spawnImpl;
    this.proc = null;
    this.pending = new Map();
    this.nextId = 1;
    this.lastStderr = '';
    this.refreshTimer = null;
  }

  async start() {
    if (this.proc) return;
    this.proc = this.spawnImpl(this.command, ['app-server'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      shell: process.platform === 'win32',
    });

    this.proc.once('error', (error) => {
      this.emit('status', {
        level: 'error',
        message: `无法启动 Codex CLI：${error.message}`,
      });
      this._rejectAll(error);
      this.proc = null;
    });

    const lines = readline.createInterface({ input: this.proc.stdout });
    lines.on('line', (line) => this._handleLine(line));
    this.proc.stderr.setEncoding('utf8');
    this.proc.stderr.on('data', (chunk) => {
      this.lastStderr = String(chunk).trim().split(/\r?\n/).at(-1) || '';
    });
    this.proc.once('exit', (code) => {
      const suffix = this.lastStderr ? `：${this.lastStderr}` : '';
      const error = new Error(`Codex app-server 已退出（${code ?? '未知'}）${suffix}`);
      this._rejectAll(error);
      this.emit('status', { level: 'error', message: error.message });
      this.proc = null;
    });

    await this.request('initialize', {
      clientInfo: {
        name: 'codex_quota_float',
        title: 'Codex Quota Float',
        version: '0.1.0',
      },
    });
    this.notify('initialized', {});
    this.emit('status', { level: 'ok', message: 'Codex 已连接' });
    await this.refresh();
  }

  request(method, params) {
    if (!this.proc) return Promise.reject(new Error('Codex 尚未连接'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} 请求超时`));
      }, 15000);
      this.pending.set(id, { resolve, reject, timeout });
      this._write({ method, id, ...(params == null ? {} : { params }) });
    });
  }

  notify(method, params) {
    this._write({ method, params });
  }

  async refresh() {
    const result = await this.request('account/rateLimits/read');
    const snapshot = normalizeRateLimits(result);
    if (snapshot.buckets.length === 0) {
      throw new Error('未返回可显示的 ChatGPT Codex 额度；请确认 Codex CLI 已使用 ChatGPT 账号登录');
    }
    this.emit('snapshot', snapshot);
    return snapshot;
  }

  _write(message) {
    if (!this.proc?.stdin?.writable) return;
    this.proc.stdin.write(`${JSON.stringify(message)}\n`);
  }

  _handleLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }

    if (Number.isInteger(message.id) && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.error) {
        pending.reject(new Error(message.error.message || 'Codex 请求失败'));
      } else {
        pending.resolve(message.result || {});
      }
      return;
    }

    if (message.method === 'account/rateLimits/updated') {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = setTimeout(() => {
        this.refresh().catch((error) => {
          this.emit('status', { level: 'error', message: error.message });
        });
      }, 500);
    }
  }

  _rejectAll(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }

  close() {
    clearTimeout(this.refreshTimer);
    this._rejectAll(new Error('Codex 连接已关闭'));
    this.proc?.kill();
    this.proc = null;
  }
}

function normalizeRateLimits(result, now = new Date()) {
  const rawMap = result?.rateLimitsByLimitId;
  const entries = rawMap && typeof rawMap === 'object'
    ? Object.entries(rawMap)
    : result?.rateLimits
      ? [[result.rateLimits.limitId || 'codex', result.rateLimits]]
      : [];

  return {
    buckets: entries.map(([id, value]) => ({
      limitId: id,
      limitName: value.limitName || id,
      primary: normalizeWindow(value.primary),
      secondary: normalizeWindow(value.secondary),
    })),
    planType: result?.planType || null,
    updatedAt: now.toISOString(),
  };
}

function normalizeWindow(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    usedPercent: Number(value.usedPercent || 0),
    windowDurationMins: Number(value.windowDurationMins || 0),
    resetsAt: Number(value.resetsAt || 0),
  };
}

module.exports = { CodexClient, normalizeRateLimits };


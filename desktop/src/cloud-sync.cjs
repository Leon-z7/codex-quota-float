'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { safeStorage } = require('electron');
const { createClient } = require('@supabase/supabase-js');

class SecureSessionStorage {
  constructor(filePath) {
    this.filePath = filePath;
    this.values = this._read();
  }

  getItem(key) {
    const encoded = this.values[key];
    if (!encoded) return null;
    try {
      const encrypted = Buffer.from(encoded, 'base64');
      return safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(encrypted)
        : encrypted.toString('utf8');
    } catch {
      return null;
    }
  }

  setItem(key, value) {
    const bytes = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(value)
      : Buffer.from(value, 'utf8');
    this.values[key] = bytes.toString('base64');
    this._write();
  }

  removeItem(key) {
    delete this.values[key];
    this._write();
  }

  _read() {
    try {
      return JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    } catch {
      return {};
    }
  }

  _write() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.values), { mode: 0o600 });
  }
}

class CloudSync {
  constructor({ configPath, sessionPath }) {
    this.configPath = configPath;
    this.sessionStorage = new SecureSessionStorage(sessionPath);
    this.client = null;
    this.config = this._readConfig();
    if (this.config) this._createClient();
  }

  _readConfig() {
    try {
      const value = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      if (!value.url || !value.publishableKey) return null;
      return value;
    } catch {
      return null;
    }
  }

  _createClient() {
    this.client = createClient(this.config.url, this.config.publishableKey, {
      auth: {
        storage: this.sessionStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }

  configure({ url, publishableKey }) {
    const normalizedUrl = String(url || '').trim().replace(/\/$/, '');
    const normalizedKey = String(publishableKey || '').trim();
    if (!/^https:\/\/.+\.supabase\.co$/i.test(normalizedUrl)) {
      throw new Error('Supabase URL 格式不正确');
    }
    if (!normalizedKey.startsWith('sb_publishable_') && normalizedKey.split('.').length !== 3) {
      throw new Error('请填写 Publishable key（不要填写 secret/service_role key）');
    }
    this.config = { url: normalizedUrl, publishableKey: normalizedKey };
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), { mode: 0o600 });
    this._createClient();
    return this.status();
  }

  async signIn(email, password) {
    this._requireClient();
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return this.status();
  }

  async signUp(email, password) {
    this._requireClient();
    const { data, error } = await this.client.auth.signUp({ email, password });
    if (error) throw error;
    return {
      ...(await this.status()),
      message: data.session ? '注册并登录成功' : '注册成功，请验证邮箱后登录',
    };
  }

  async signOut() {
    if (this.client) await this.client.auth.signOut();
    return this.status();
  }

  async status() {
    if (!this.client) return { configured: false, signedIn: false };
    const { data } = await this.client.auth.getSession();
    return {
      configured: true,
      signedIn: Boolean(data.session),
      email: data.session?.user?.email || null,
    };
  }

  async upload(snapshot) {
    if (!this.client) return { uploaded: false, reason: 'not_configured' };
    const { data } = await this.client.auth.getUser();
    if (!data.user) return { uploaded: false, reason: 'not_signed_in' };
    const now = new Date().toISOString();
    const { error } = await this.client.from('quota_snapshots').upsert({
      user_id: data.user.id,
      payload: snapshot,
      source_updated_at: snapshot.updatedAt,
      updated_at: now,
    }, { onConflict: 'user_id' });
    if (error) throw error;
    return { uploaded: true };
  }

  _requireClient() {
    if (!this.client) throw new Error('请先配置 Supabase 项目');
  }
}

module.exports = { CloudSync, SecureSessionStorage };


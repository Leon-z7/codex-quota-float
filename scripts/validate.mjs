import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const required = [
  'desktop/package.json',
  'desktop/src/main.cjs',
  'desktop/src/codex-client.cjs',
  'ios_pwa/package.json',
  'ios_pwa/public/manifest.webmanifest',
  'supabase/migrations/20260922000000_create_quota_snapshots.sql',
];

for (const file of required) {
  if (!existsSync(join(root, file))) throw new Error(`缺少文件：${file}`);
}

const desktopPackage = JSON.parse(readFileSync(join(root, 'desktop/package.json'), 'utf8'));
const pwaPackage = JSON.parse(readFileSync(join(root, 'ios_pwa/package.json'), 'utf8'));
if (/\^|~|\*/.test(desktopPackage.dependencies['@supabase/supabase-js'])) {
  throw new Error('桌面依赖必须固定版本');
}
if (/\^|~|\*/.test(pwaPackage.dependencies['@supabase/supabase-js'])) {
  throw new Error('PWA 依赖必须固定版本');
}

const migration = readFileSync(join(root, 'supabase/migrations/20260922000000_create_quota_snapshots.sql'), 'utf8');
for (const expected of [
  'enable row level security',
  'revoke all on table public.quota_snapshots from anon, authenticated',
  'using ((select auth.uid()) = user_id)',
  'with check ((select auth.uid()) = user_id)',
]) {
  if (!migration.toLowerCase().includes(expected)) throw new Error(`安全迁移缺少：${expected}`);
}

console.log('项目结构、依赖固定和 RLS 安全检查通过。');


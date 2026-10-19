import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
for (const file of ['desktop/package.json','desktop/package-lock.json','desktop/src/main.cjs','desktop/src/preload.cjs','desktop/src/codex-client.cjs','desktop/src/preferences.cjs','desktop/src/renderer/index.html','desktop/assets/icon.ico']) {
  if (!existsSync(join(root,file))) throw new Error('Missing '+file);
}
const pkg=JSON.parse(readFileSync(join(root,'desktop/package.json'),'utf8'));
if (pkg.version !== '0.2.3') throw new Error('Version mismatch');
if (Object.keys(pkg.dependencies||{}).length) throw new Error('Unexpected runtime dependency');
const lock=JSON.parse(readFileSync(join(root,'desktop/package-lock.json'),'utf8'));
if (Object.keys(lock.packages).some(name=>name.includes('@supabase'))) throw new Error('Remote dependency remains');
function files(dir) { return readdirSync(dir,{withFileTypes:true}).flatMap(item=>item.isDirectory()?files(join(dir,item.name)):[join(dir,item.name)]); }
for(const file of files(join(root,'desktop/src'))) {
  const text=readFileSync(file,'utf8');
  if (/supabase|CloudSync|cloud:|configureCloud|onCloudUpload/.test(text)) throw new Error('Remote code remains in '+file);
}
const html=readFileSync(join(root,'desktop/src/renderer/index.html'),'utf8');
if (!html.includes("connect-src 'none'")) throw new Error('Renderer network must be disabled');
for(const dir of ['ios_pwa','native_flutter','supabase']) if(existsSync(join(root,dir))) throw new Error('Unexpected remote platform '+dir);
console.log('Windows-only structure, fixed version, dependency removal and renderer network policy verified.');

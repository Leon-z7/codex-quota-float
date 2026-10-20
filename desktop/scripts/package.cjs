'use strict';
(async () => {
  const { packager } = await import('@electron/packager');
  const path = require('node:path');
  const outputs = await packager({
    dir: path.resolve(__dirname, '..'), name: 'CodexQuotaFloat', platform: 'win32', arch: 'x64',
    tmpdir: process.env.QUOTA_BUILD_TMP || undefined,
    out: path.resolve(__dirname, '../release'), overwrite: true, prune: true, asar: true,
    icon: path.resolve(__dirname, '../assets/icon.ico'),
    electronZipDir: process.env.ELECTRON_ZIP_DIR || undefined,
    appVersion: require('../package.json').version, appCopyright: 'Codex Quota Float',
    win32metadata: { CompanyName: 'Leon-z7', ProductName: 'Codex Quota Float', FileDescription: 'Codex Quota Float for Windows' },
    ignore: [/^\/release($|\/)/, /^\/test($|\/)/, /^\/scripts($|\/)/],
  });
  console.log(outputs.join('\n'));
})().catch(error => { console.error(error); process.exitCode = 1; });

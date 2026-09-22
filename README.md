# Codex 额度悬浮条

一个实用的双端方案：

- **Windows**：真正置顶的透明悬浮窗，直接从本机 Codex CLI 读取额度。
- **iPhone**：安装到主屏幕的 PWA，打开后顶部固定显示额度条；任何网络均可读取 Windows 最近同步的数据。
- **可选原生端**：`native_flutter` 中保留了 Flutter 源码，可继续生成 Windows/iOS 原生工程。

同步内容只有额度百分比、额度窗口、重置时间和更新时间；不会上传 ChatGPT 登录凭据、聊天内容或项目文件。

## 你会看到什么

Windows 悬浮条默认显示两个主要额度窗口，例如“5 小时”和“周额度”，包括：

- 剩余百分比；
- 彩色进度条；
- 下次重置时间；
- 一键刷新和展开设置；
- 始终置顶。

iPhone 端每 30 秒刷新一次，切回应用时立即刷新。

## 一、准备 Codex

Windows 端依赖官方 Codex CLI 的本地 `app-server`：

1. 安装 Codex CLI，并确保 PowerShell 中可以运行 `codex --version`。
2. 使用 ChatGPT 账户登录 Codex。
3. 先在 PowerShell 中运行一次 `codex`，确认额度可用。

如果只使用 API Key 登录，ChatGPT 套餐额度可能不会返回。

## 二、创建跨设备同步

1. 创建一个 Supabase 项目。
2. 打开 SQL Editor，执行：
   `supabase/migrations/20260922000000_create_quota_snapshots.sql`
3. 在项目的 Authentication 设置中启用 Email 登录。
4. 记录项目 URL 和 **Publishable key**。

不要把 `secret` 或 `service_role` key 填入任何客户端。数据库已启用 RLS，每个账户只能读取和更新自己的额度记录。

## 三、运行 Windows 端

### 使用已打包程序

解压 `CodexQuotaFloat-Windows-x64.zip`，运行 `CodexQuotaFloat.exe`。

第一次使用：

1. 展开悬浮条；
2. 填写 Supabase URL 和 Publishable key；
3. 创建同步账户；
4. 如项目要求邮箱验证，验证后再登录。

### 自己构建

需要 Node.js 22 或更高版本。在 PowerShell 中运行：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\build_windows.ps1
```

输出位于 `desktop\release\CodexQuotaFloat-Windows-x64.zip`。

## 四、在 iPhone 使用

`ios_pwa/dist` 是静态网页成品，需要部署到任意 HTTPS 静态托管服务。部署后：

1. 使用 Safari 打开网址；
2. 填写与 Windows 端相同的 Supabase URL 和 Publishable key；
3. 登录同一个同步账户；
4. 点 Safari“分享”→“添加到主屏幕”。

之后从主屏幕打开即可获得独立应用界面。

### 自己构建 PWA

```powershell
.\scripts\build_ios_pwa.ps1
```

输出位于 `ios_pwa\dist`。

## iOS 限制

iOS 不允许普通第三方应用长期覆盖在微信、Safari 或其他应用之上。因此这里的“应用内悬浮条”固定在本应用顶部，不能跨应用覆盖。这不是插件能够绕过的限制。

## 安全设计

- Codex 登录只留在 Windows 本机，由官方 `codex app-server` 管理。
- Windows 本地的同步会话使用 Electron `safeStorage` 加密。
- 云端只接收额度快照。
- 客户端只用 Publishable key。
- `quota_snapshots` 开启 RLS，读、写、更新都校验 `auth.uid() = user_id`。
- `anon` 角色没有表权限。

## 开发与测试

桌面逻辑测试：

```bash
cd desktop
npm ci
npm test
```

项目安全与结构检查：

```bash
node scripts/validate.mjs
```

Supabase 本地环境可运行：

```bash
supabase test db
```

## 故障排查

- **找不到 Codex CLI**：确认 `codex --version` 在普通 PowerShell 中可运行，再重启悬浮条。
- **没有额度数据**：确认 Codex 使用 ChatGPT 账户登录，而非仅 API Key。
- **iPhone 显示无数据**：先让 Windows 端成功读取一次，并确认两端登录同一同步账户。
- **同步被拒绝**：重新执行数据库迁移，并确认 Data API 暴露 `public` schema。
- **应用启动后不置顶**：不要以兼容模式运行；关闭后重新打开。

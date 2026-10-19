# Codex Quota Float · Windows v0.2.1

Windows 本机 Codex 额度悬浮窗。默认采用 Apple 风格卡片，提供紧凑胶囊、Fluent 面板和 Mini 极简胶囊。支持浅色、深色、跟随系统。

## 下载与使用

解压完整 Windows x64 压缩包，双击 **CodexQuotaFloat.exe**。不要只复制 exe，其他文件是运行依赖。

需要已安装官方 Codex CLI，并用 ChatGPT 账户登录。先确认普通终端可以运行 `codex --version` 和 `codex login status`。API Key 登录可能没有 ChatGPT 套餐额度。

- 主界面显示服务端实际返回的额度窗口、剩余百分比和本地时区的重置时间。
- 拖动标题栏移动窗口；点击 ◇ 切换置顶，⚙ 展开设置，− 收起到系统托盘。
- 托盘点击/双击重新打开；右键菜单支持刷新、置顶、退出。
- 默认每分钟刷新，可改为 30 秒、2 分钟、5 分钟。
- 设置中切换 Apple / Capsule / Fluent / Mini 四种布局和深浅色；窗口位置和偏好保存在本机。
- 有多个额度池时可通过下拉框选择，默认优先 Codex 额度池。
- 连接失败时自动重试，保留上次数据并标明中断/过期；无数据时不显示虚构百分比。

## v0.2.1 变更

- 新增可选「Mini · 极简胶囊」：设置 → 窗口样式选择。保留现有默认样式和用户偏好。
- 默认仅显示短期剩余百分比、重置时间和「⋯」；18px 常规蓝色百分比与 13px 时间共用基线，窗口按内容收缩。
- 点击「⋯」展开额度详情，查看周额度和完整重置日期、连接状态、刷新与全部偏好；再次点击、按 Esc 或失去焦点收起。
- 拖动胶囊文字区域移动；置顶、隐藏与退出也可在系统托盘操作。重启保留选中样式。
- 无短期数据时显示 —% / --:--；连接中断保留旧值，鼠标悬停与详情标明状态。

## v0.2.0 变更

- 移除跨设备同步模块、相关运行依赖、云端配置与同步账户表单。
- 新版仅包含 Windows 桌面应用，移除 iPhone PWA、Flutter 备选端和云端数据库部署内容。
- 主界面与偏好设置重新设计，修复原版窗口裁切、启动事件丢失和缺少定时刷新等问题。
- 增加单实例、托盘、位置恢复、额度池选择和数据过期提示。
- 保留官方 Codex app-server 读取路径，优先直接启动 Windows 原生 CLI，窗口后台启动。
- 旧版云端数据和旧账户文件不受此版本修改；新版不会读取或使用它们。

## 数据边界

本应用只通过子进程标准输入/输出访问本机官方 Codex CLI。无同步服务器、跨设备接口和同步账户；渲染进程的网络连接被 CSP 禁止。
CLI 为获取真实额度仍需访问官方服务。应用不读取 ChatGPT 密码或手动复制令牌。

## 本地构建

需要 Windows x64 和 Node.js 22.12 或更高版本。

```powershell
.\scripts\build_windows.ps1
```

输出：`desktop\release\CodexQuotaFloat-Windows-x64-v0.2.1.zip`。

或逐步运行：

```powershell
cd desktop
npm ci
npm test
npm run package:win
```

支持通过 `ELECTRON_ZIP_DIR` 指向包含固定版本 Electron ZIP 的目录进行离线打包；
`QUOTA_BUILD_TMP` 可指定可写的构建暂存目录。普通用户无需设置。

## 验证

v0.2.1 新增浏览器界面验证（需另行安装 Playwright 和其 Chromium；不影响应用运行）：

```powershell
node test/ui-browser.cjs
```

覆盖四种样式、Mini 展开收起、Esc/Enter/失焦、深浅色、完整周重置日期、刷新、异常和缺失数据。截图使用演示数据。


```powershell
cd desktop
npm test
node ..\scripts\validate.mjs
# 可选：在桌面会话中运行隐藏窗口界面测试（使用演示数据）
.\node_modules\electron\dist\electron.exe test\ui-smoke.cjs
```

测试包括额度数值异常、协议握手、错误与断线、设置恢复，以及四种布局、设置展开、深色、额度池、过期状态和长错误消息。界面测试截图是演示数据，不代表账户余额。

## 故障处理

- **找不到 CLI**：安装官方 Codex CLI，确保 `codex --version` 可运行，重启应用。
- **未返回额度**：确认使用 ChatGPT 账户登录，而非仅 API Key；点击刷新。
- **数据已过期**：检查网络和 CLI 登录状态；恢复后会自动刷新。
- **点 − 后找不到窗口**：在任务栏通知区域（可能位于隐藏图标中）点击 Codex Quota。

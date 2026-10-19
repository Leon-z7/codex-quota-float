# v0.2.5

- Keep the Percent capsule stationary by rendering its dropdown in a separate native window.
- Preserve fade reversal, edge placement, settings focus, native selects and keyboard interaction.
- Share quota-pool selection between capsule and dropdown.
- Verify production main/preload/IPC with actual Windows BrowserWindows; see docs/percent-native-fix.md.
- Source update only; no executable package produced.

# v0.2.4

- 修复百分比悬停展开时先显示、后扩容引起的裁切和跳动。
- 固定胶囊屏幕坐标，空间不足时改为向上展开，长菜单滚动显示。
- 增加淡入淡出；淡出完成后缩窗，快速重新移入可平滑反向播放。
- 串行化原生窗口尺寸请求，过滤旧坐标事件，修复准备阶段键盘焦点丢失。

# v0.2.3

- 新增 Percent 百分比悬停 UI，复用极简胶囊的字体与居中处理。
- 常态只显示五小时剩余百分比，悬停展开完整额度、更新时间和设置，移开延迟收起。
- 保持 Windows 原生拖动；支持键盘展开/收起、浅色/深色、无数据占位。

## 0.2.2 — 2026-10-19

- Replace the existing Mini capsule with the approved centered reference design.
- Use 20px regular blue percentage, 16px time, and centered SVG menu dots.
- Center visible glyphs after quota and font changes; preserve dynamic sizing, details, and themes.
- Add dependency-free Chromium verification for display scales, variable readings, and interactions.
- Source update only; no new Windows package was built.

# v0.2.1 · 2026-10-19

- 新增 Mini 可选 UI，保留 Apple、Capsule、Fluent 三款现有布局与默认偏好。
- 胶囊仅显示短期剩余百分比、重置时间与详情按钮；内容自适应宽度、百分比放大、横排对齐。
- 详情集中显示周剩余额度、完整重置日期、连接状态、刷新、置顶及外观设置。
- 支持 Esc / 失焦收起、键盘操作、深浅色、重启恢复；展开收起保留胶囊右侧位置。

构建验证详见本版本交付的验证记录。此版本未在 Windows 桌面实机运行。

# v0.2.0 · 2026-10-19

Windows 单端版本，基于 v0.1.0（上游提交 87e75758c9b151e7144e18bb0b9f18425b2b2ba2）的桌面源码改造。

- 移除远端协同显示与云端账户依赖。
- Apple 卡片默认外观，附带 Capsule 紧凑胶囊与 Fluent 简洁面板。
- 深浅色与系统外观、自动刷新、置顶、系统托盘、位置恢复。
- 连接错误、数据过期、多个额度池、未知额度、无重置时间均明确展示。

验证：6 项 Node 测试通过；隐藏 Electron 窗口的三种样式和交互测试通过；本机官方 Codex 真实连接通过。

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

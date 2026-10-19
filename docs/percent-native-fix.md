# Percent hover fix — v0.2.5

The v0.2.4 implementation moved and resized the native window before returning
its layout through IPC. Renderer offsets were applied afterward. The capsule
could therefore jump between those operations, even when its eventual screen
coordinates were correct. The old Chromium test applied both operations in one
evaluation and could not detect this native compositor race.

Percent now uses two native windows. The capsule remains 60 DIP high; its hover
state never changes its bounds. A separate transparent dropdown is measured
before it is shown, chooses above/below placement, and animates only its content.
The native dropdown hides after fade-out. A version token prevents a stale close
from hiding it after the pointer returns. Cursor sampling covers both windows;
activating a setting no longer closes the capsule on blur. Native select and
keyboard interactions keep the dropdown open. Quota pool selection is shared
between the two renderers.

## Verification

- `node --test desktop/test/*.test.cjs`: 12 tests passed.
- `node scripts/validate.mjs`: project validation passed.
- `node desktop/test/ui-mini-reference.cjs`: 32 alignment cases and interactions passed.
- `node desktop/test/ui-percent.cjs`: legacy inline browser preview checks; these
  remain typography/interaction coverage, not proof of native window behavior.
- `electron desktop/test/ui-percent-native.cjs`: production main, preload, IPC,
  popup controller, and both renderers running as real Windows BrowserWindows.
  Only quota data, initial preferences and cursor samples are fixtures. No account
  credentials are used and user preferences are isolated in a temporary profile.

The native regression passed on Electron 44.4.3 / Windows at 150% scaling. Four
positions cover left, right, bottom and middle of a 1707 × 912 DIP work area.
During each open/close cycle the capsule emitted **zero native move and resize
events** and retained its bounds. Captured renderer frames contain intermediate
opacity values. Additional checks cover fade reversal, stationary hover, setting
activation, native-select hold, rapid reentry, keyboard opening, Escape, shared
quota pool selection, dark theme, parent hiding and style changes.

Reproduce after `npm ci` in `desktop`:

```powershell
npx electron test/ui-percent-native.cjs
```

Results are written to `artifacts/percent-native/verification.json`; captured
dropdown images use deterministic demonstration data. This is a source change;
no installer or executable distribution has been built. Hardware mouse input,
other monitor/DPI configurations and the user's existing executable remain
outside the automated test.

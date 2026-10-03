# Changelog

## 2.1.0 — 2026-10-03

- Display timing in a below-editor widget instead of replacing Pi's native footer. Native routed-model, cost, cache-warming and extension-status display remains available.
- Restore the latest timing checkpoint on the active branch, and reset state on tree navigation.
- Keep renders width-bounded, close timers on disposal/shutdown, and skip terminal UI in non-TUI modes.
- Persist completed turn timings, including the final settled boundary.

Verification: `npm run check`, `npm test` (branch checkpoints, narrow widths and non-TUI mode); real Pi 1.0 extension-loader smoke check. Interactive fullscreen visual checks are not included in the automated suite.

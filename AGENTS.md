# pi-time-tracker

A Pi extension that adds branch-aware session timing in a below-editor widget.

## Development

- Run `pi -e .` to test the extension locally
- Preserve Pi's native footer; timing belongs in the widget
- Run `npm run check` and `npm test` before release
- Uses `pi.appendEntry()` for persistence across reloads and session resume
# pi-time-tracker

A [Pi](https://pi.dev) extension that displays session timing in a below-editor widget, preserving Pi 1.0's native model/cost footer.

## Features

Shows in the timing widget:
- **Session time**: Total time since session start (HH:MM:SS)
- **Start time**: When the session began (HH:MM:SS)
- **Working time**: Cumulative time the agent was actively processing
- **Idle time**: Time spent waiting for user input
- **TPS**: Tokens per second (throughput during working time)

## Installation

```bash
pi install git:github.com/SamuelLHuber/pi-time-tracker
```

Or for local development:

```bash
pi -e /path/to/pi-time-tracker
```

## Usage

The extension activates automatically in TUI mode. Timing appears below the editor; Pi retains its native footer, including routed models, cost and other extension statuses. Both regular and fullscreen modes use the same width-bounded widget.

## Format

```
/path/to/project (main) • Session Name
↑12k ↓5k R3k W1k $0.050 45%/200k (auto) anthropic/claude-sonnet-4
⏱ 00:15:23 (started 14:32:01)  ⚙ 00:08:45  💤 00:06:38  🚀 53.5 tok/s
```

Icons:
- ⏱ Session time + start time
- ⚙ Working time (agent processing)
- 💤 Idle time (waiting for user)
- 🚀 TPS (tokens per second throughput)
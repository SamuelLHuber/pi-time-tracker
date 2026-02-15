# pi-time-tracker

A [pi-coding-agent](https://github.com/badlogic/pi-mono) extension that displays session timing information in the footer.

## Features

Shows in the footer:
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

The extension activates automatically. The footer will display timing information alongside the standard pwd, tokens, context usage, and model info.

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
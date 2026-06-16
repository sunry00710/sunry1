# WeChat Claude Code Bridge — Windows Edition

> Chat with Claude Code in WeChat. Now runs on Windows too.

## What's This

A Windows-adapted fork of [wechat-claude-code-enhanced](https://github.com/UnknownJackMe/wechat-claude-code-enhanced), which itself builds on [Wechat-ggGitHub/wechat-claude-code](https://github.com/Wechat-ggGitHub/wechat-claude-code) (MIT).

All enhanced features preserved, plus Windows support.

## Windows Adaptations

| Change | What it does |
|--------|-------------|
| Cross-platform daemon | TypeScript rewrite of `scripts/daemon.sh` — detached child process + PID files on Windows |
| Path fixes | Handles `/Users/` regex, missing `HOME`, and other Unix-isms |
| Claude CLI compat | `spawn` with `shell: true` + `windowsHide` on Windows |
| Auto-start | Windows Task Scheduler via `schtasks` |

## Install

```bash
git clone https://github.com/sunry00710/sunry1.git ~/.claude/skills/wechat-claude-code
cd ~/.claude/skills/wechat-claude-code && npm install
```

First-time setup:

```bash
npm run setup                # Scan QR to bind WeChat
npm run daemon -- start      # Start daemon
npm run daemon -- status     # Check status
npm run daemon -- logs       # View logs
```

## Commands

### Sessions
| Command | What it does |
|---------|-------------|
| `/resume` | List or restore past sessions |
| `/compact` | Squash context, same session ID (~96% token reduction) |
| `/clear` | Fresh session |
| `/reset` | Full reset |
| `/stop` | Stop current task |

### Model & Reasoning
| Command | What it does |
|---------|-------------|
| `/model <alias>` | Switch model |
| `/model-config` | Manage model aliases |
| `/effort [level]` | Reasoning depth: low / medium / high / xhigh / max |
| `/advisor [model]` | Advisor model: opus / sonnet / fable / off |

### Tasks
| Command | What it does |
|---------|-------------|
| `/goal <condition>` | Auto-loop until condition met |
| `/loop <interval> <prompt>` | Scheduled task, e.g. `/loop 5m check CI` |

### File Transfer
| Command | What it does |
|---------|-------------|
| `/send-me <path>` | Claude sends files to you |
| `/send-you` | You send files/images to Claude |

### Misc
| Command | What it does |
|---------|-------------|
| `/status` | Session status |
| `/cwd [path]` | Working directory |
| `/prompt [text]` | System prompt |
| `/help` | Full command list |

## License

MIT

# WeChat Claude Code Bridge — Windows 适配版

> 在微信里跟 Claude Code 聊天，现在 Windows 也能跑了。

## 这是什么

基于 [wechat-claude-code-enhanced](https://github.com/UnknownJackMe/wechat-claude-code-enhanced) 做的 Windows 适配，原项目又来自 [Wechat-ggGitHub/wechat-claude-code](https://github.com/Wechat-ggGitHub/wechat-claude-code)（MIT）。

增强版已有的功能全部保留，我额外加了 Windows 平台支持。

## Windows 适配改动

| 改动 | 做了什么 |
|------|---------|
| 跨平台 daemon 管理器 | 用 TS 重写 `scripts/daemon.sh`，Windows 用 detached 子进程 + PID 文件 |
| 路径兼容 | 修了 `/Users/` 正则只认 Unix 路径、`HOME` 环境变量不存在等问题 |
| Claude CLI 适配 | Windows 上 spawn 加 `shell: true` + `windowsHide` |
| 开机自启 | 通过 `schtasks` 注册 Windows 任务计划 |

## 安装

```bash
git clone https://github.com/sunry00710/sunry1.git ~/.claude/skills/wechat-claude-code
cd ~/.claude/skills/wechat-claude-code && npm install
```

首次扫码 + daemon 管理：

```bash
npm run setup                # 扫码绑定
npm run daemon -- start      # 启动
npm run daemon -- status     # 状态
npm run daemon -- logs       # 日志
```

### 更新代码

```bash
git pull && npm install && npm run daemon -- restart
```

> 每次 pull 后必须 restart，否则 daemon 缓存的是旧代码。

## 命令列表

### 会话管理
| 命令 | 说明 |
|------|------|
| `/resume` | 列出历史对话，`/resume 2` 恢复第 2 条 |
| `/compact` | 压缩上下文（session ID 不变，实测 177k → 7k tokens） |
| `/clear` | 清除当前会话 |
| `/reset` | 完全重置 |
| `/stop` | 停止当前任务 |
| `/history [n]` | 查看对话记录 |
| `/undo [n]` | 撤销最近对话 |

### 模型 & 推理
| 命令 | 说明 |
|------|------|
| `/model <别名>` | 切换模型 |
| `/model-config` | 管理模型别名（`/model-config sonnet claude-sonnet-4-6-thinking[1m]`） |
| `/effort [级别]` | 思考强度：low / medium / high / xhigh / max |
| `/advisor [模型]` | 顾问模型：opus / sonnet / fable / off |

### 任务控制
| 命令 | 说明 |
|------|------|
| `/goal <条件>` | 设个目标，Claude 自动循环直到满足 |
| `/loop <间隔> <内容>` | 定时任务，如 `/loop 5m 检查 CI` |

### 文件互传
| 命令 | 说明 |
|------|------|
| `/send-me <路径>` | Claude 发文件给你（支持多文件、目录） |
| `/send-you` | 进入接收模式，你发文件/图片给 Claude |
| `/send-you-end <要求>` | 结束接收，文件+要求一起交给 Claude |

### 其他
| 命令 | 说明 |
|------|------|
| `/cwd [路径]` | 查看/切换工作目录 |
| `/status` | 当前会话状态 |
| `/prompt [内容]` | 查看/设置系统提示词 |
| `/configs` | Workspace 配置管理 |
| `/skills` | 已安装的 skills |
| `/version` | 版本信息 |
| `/help` | 全部命令 |

## License

MIT

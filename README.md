# pi note extension

给 pi 增加 `/note` 命令，用来在开发过程中临时记录想法，而不是把它们排进当前对话队列。

## 使用场景

当 pi 正在执行任务时，你可能突然想到一个后续优化点：

```text
/note 用户管理页面的按钮调整一下圆角
```

这条内容会进入本地 note 暂存区，不会发送给模型，也不会打断当前任务。等当前任务真正完成后，再用：

```text
/note
```

选择之前保存的 note，插件会直接把它作为用户消息发送，并把这条 note 标记为已消耗。已消耗的 note 默认不会再出现在列表里。

如果你想先把 note 放进输入框里再手动编辑，使用：

```text
/note edit
```

## 命令

| 命令 | 说明 |
| --- | --- |
| `/note <内容>` | 添加一条临时 note |
| `/note` | 从当前目录的未发送 notes 里选择一条并直接发送，同时标记为已消耗 |
| `/note --all` | 从所有目录的未发送 notes 里选择一条并直接发送，同时标记为已消耗 |
| `/note edit` | 从当前目录的未发送 notes 里选择一条，填入输入框但不发送，同时标记为已消耗 |
| `/note edit --all` | 从所有目录的未发送 notes 里选择一条，填入输入框但不发送，同时标记为已消耗 |
| `/note remove` | 选择并删除当前目录的一条未发送 note |
| `/note remove --all` | 选择并删除所有目录中的一条未发送 note |
| `/note clear` | 清空当前目录的未发送 notes，会先确认 |
| `/note clear --all` | 清空所有目录的未发送 notes，会先确认 |
| `/note clear --yes` | 跳过确认并清空当前目录的未发送 notes |
| `/note clear --all --yes` | 跳过确认并清空所有目录的未发送 notes |
| `/note help` | 查看命令帮助 |

## 数据存储

notes 保存在 Pi 的用户级 agent 配置目录：

```text
~/.pi/agent/notes.json
```

插件通过 Pi 官方的 `getAgentDir()` 获取目录，因此会自动尊重 `PI_CODING_AGENT_DIR` 覆盖。旧版 `~/.pi/agent/note/notes.json` 如存在，会在读取时自动迁移到新位置。

每条 note 包含：

- `id`：唯一标识
- `text`：note 内容
- `createdAt`：创建时间
- `cwd`：创建 note 时所在的工作目录
- `sentAt`：可选，note 被 `/note` 或 `/note edit` 消耗的时间

这个文件只用于本地暂存，不会自动进入 LLM 上下文。

## 安装位置

当前插件放在 pi 的全局扩展目录：

```text
~/.pi/agent/extensions/note/index.ts
```

如果 pi 已经在运行，执行：

```text
/reload
```

重新加载扩展后即可使用 `/note`。

## 设计说明

- `/note <内容>` 只写入本地 JSON 文件，不调用 `sendUserMessage`，避免误把后续需求排队发送给模型。
- `/note`、`/note edit`、`/note remove`、`/note clear` 默认只作用于当前工作目录；加 `--all` 后作用于所有目录。
- `/note` 会直接发送所选 note；如果当前 agent 正在工作，会作为 follow-up 排队到当前任务结束后发送。
- `/note edit` 只填充输入框，不直接发送，保留给你最后确认和编辑的机会。
- `/note` 和 `/note edit` 都会把所选 note 标记为已消耗。
- 已消耗的 notes 会保留在 JSON 文件中，但不会再被 `/note`、`/note edit`、`/note remove`、`/note clear` 的默认未发送视图显示。
- notes 按创建时间保存，选择时按最新优先展示。
- 插件只依赖 Node.js 内置模块和 pi 扩展 API，不需要额外安装 npm 依赖。

# pi-note

[中文文档](README.zh-CN.md)

A pi extension that adds a `/note` command for jotting down ideas during development without interrupting the current conversation.

## Install

```bash
pi install git:github.com/ec50n9/pi-note@v1.0.0
```

If pi is already running, run `/reload` to pick up the extension.

## Usage

While pi is busy working on a task, you might think of a follow-up idea:

```text
/note tighten up the border-radius on the user management page
```

This saves the note locally without sending it to the model or queuing a new message. Once the current task is done:

```text
/note
```

Pick a saved note — the extension sends it as a user message and marks it as consumed. Consumed notes are hidden from the default list.

To stage a note in the input box for manual editing first:

```text
/note edit
```

## Commands

| Command | Description |
| --- | --- |
| `/note <content>` | Save a note |
| `/note` | Pick and send a note from the current directory (marks as consumed) |
| `/note --all` | Pick and send a note from all directories |
| `/note edit` | Pick a note and stage it in the input box without sending |
| `/note edit --all` | Same as above, across all directories |
| `/note remove` | Pick and delete a note from the current directory |
| `/note remove --all` | Pick and delete a note from all directories |
| `/note clear` | Clear all unconsumed notes in the current directory (with confirmation) |
| `/note clear --all` | Clear all unconsumed notes across all directories |
| `/note clear --yes` | Skip confirmation |
| `/note help` | Show help |

## Storage

Notes are stored in pi's user-level agent config directory:

```text
~/.pi/agent/notes.json
```

The extension uses pi's official `getAgentDir()`, so it respects the `PI_CODING_AGENT_DIR` override. Legacy data at `~/.pi/agent/note/notes.json` is auto-migrated on read.

Each note contains:

- `id` — unique identifier
- `text` — note content
- `createdAt` — creation timestamp
- `cwd` — working directory where the note was created
- `sentAt` — timestamp when the note was consumed (optional)

Notes are local only and never enter the LLM context automatically.

## Design

- `/note <content>` writes to a local JSON file only. It does not call `sendUserMessage`, avoiding accidental queuing of follow-up requests.
- `/note`, `/note edit`, `/note remove`, and `/note clear` default to the current working directory. Add `--all` to scope across all directories.
- `/note` sends the selected note immediately. If the agent is busy, it queues as a follow-up after the current task completes.
- `/note edit` fills the input box without sending, giving you a chance to review and tweak.
- Both `/note` and `/note edit` mark the selected note as consumed.
- Consumed notes remain in the JSON file but are excluded from the default unconsumed view.
- Notes are stored by creation time and displayed newest-first.
- No npm dependencies — only Node.js built-ins and the pi extension API.

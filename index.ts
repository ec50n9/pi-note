import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent"
import { getAgentDir } from "@earendil-works/pi-coding-agent"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"

const STORE_PATH = join(getAgentDir(), "notes.json")
const LEGACY_STORE_PATH = join(getAgentDir(), "note", "notes.json")
const MAX_PREVIEW_LENGTH = 80

type Note = {
  id: string
  text: string
  createdAt: number
  cwd: string
  sentAt?: number
}

type NoteStore = {
  version: 1
  notes: Note[]
}

const emptyStore = (): NoteStore => ({ version: 1, notes: [] })

const formatTime = (timestamp: number): string => new Date(timestamp).toLocaleString()

const preview = (text: string): string => {
  const normalized = text.replace(/\s+/g, " ").trim()
  if (normalized.length <= MAX_PREVIEW_LENGTH) return normalized
  return `${normalized.slice(0, MAX_PREVIEW_LENGTH - 1)}…`
}

const normalizeNoteText = (text: string): string => text.trim()

async function readStore(): Promise<NoteStore> {
  const readPath = async (path: string): Promise<NoteStore | undefined> => {
    try {
      const raw = await readFile(path, "utf8")
      const parsed = JSON.parse(raw) as Partial<NoteStore>
      if (!Array.isArray(parsed.notes)) return emptyStore()

      return {
        version: 1,
        notes: parsed.notes
          .filter((note): note is Note =>
            typeof note?.id === "string" &&
            typeof note.text === "string" &&
            typeof note.createdAt === "number" &&
            typeof note.cwd === "string" &&
            (note.sentAt === undefined || typeof note.sentAt === "number")
          )
          .sort((a, b) => a.createdAt - b.createdAt),
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
      throw error
    }
  }

  const current = await readPath(STORE_PATH)
  if (current) return current

  const legacy = await readPath(LEGACY_STORE_PATH)
  if (!legacy) return emptyStore()

  await writeStore(legacy)
  return legacy
}

async function writeStore(store: NoteStore): Promise<void> {
  await mkdir(dirname(STORE_PATH), { recursive: true })
  await writeFile(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8")
}

const createNote = (text: string, cwd: string): Note => ({
  id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  text,
  createdAt: Date.now(),
  cwd,
})

const renderNote = (note: Note, index: number): string => {
  const scope = note.cwd ? ` · ${note.cwd}` : ""
  return `${index + 1}. ${preview(note.text)} (${formatTime(note.createdAt)}${scope})`
}

const isAllScope = (args: string): boolean => args.split(/\s+/).includes("--all")

const visibleNotes = (notes: Note[], cwd: string, includeAll: boolean): Note[] =>
  notes.filter((note) => !note.sentAt && (includeAll || note.cwd === cwd))

const notifyEmpty = (ctx: ExtensionCommandContext, includeAll: boolean): void => {
  const scope = includeAll ? "所有目录" : "当前目录"
  ctx.ui.notify(`${scope}还没有未发送的 note。用 /note <内容> 添加一条。`, "info")
}

async function addNote(text: string, ctx: ExtensionCommandContext): Promise<void> {
  const normalized = normalizeNoteText(text)
  if (!normalized) {
    ctx.ui.notify("用法：/note <内容>，例如 /note 用户管理页面按钮圆角调小", "warning")
    return
  }

  const store = await readStore()
  const note = createNote(normalized, ctx.cwd)
  store.notes.push(note)
  await writeStore(store)
  ctx.ui.notify(`已暂存 note：${preview(note.text)}`, "info")
}

async function pickNote(args: string, ctx: ExtensionCommandContext): Promise<Note | undefined> {
  const includeAll = isAllScope(args)
  const { notes } = await readStore()
  const scopedNotes = visibleNotes(notes, ctx.cwd, includeAll)
  if (scopedNotes.length === 0) {
    notifyEmpty(ctx, includeAll)
    return undefined
  }

  const newestFirst = [...scopedNotes].sort((a, b) => b.createdAt - a.createdAt)
  const labels = newestFirst.map((note, index) => renderNote(note, index))
  const scope = includeAll ? "所有目录" : "当前目录"
  const choice = await ctx.ui.select(`选择要填入输入框的 note（${scope}）`, labels)
  if (!choice) return undefined

  const selectedIndex = labels.indexOf(choice)
  return selectedIndex >= 0 ? newestFirst[selectedIndex] : undefined
}

async function consumeNote(note: Note): Promise<void> {
  const store = await readStore()
  await writeStore({
    ...store,
    notes: store.notes.map((item) => item.id === note.id ? { ...item, sentAt: Date.now() } : item),
  })
}

async function sendNote(args: string, ctx: ExtensionCommandContext, pi: ExtensionAPI): Promise<void> {
  const note = await pickNote(args, ctx)
  if (!note) return

  await consumeNote(note)
  if (ctx.isIdle()) {
    pi.sendUserMessage(note.text)
  } else {
    pi.sendUserMessage(note.text, { deliverAs: "followUp" })
  }
  ctx.ui.notify("已发送 note，并标记为已消耗。", "info")
}

async function editNote(args: string, ctx: ExtensionCommandContext): Promise<void> {
  const note = await pickNote(args, ctx)
  if (!note) return

  await consumeNote(note)
  ctx.ui.setEditorText(note.text)
  ctx.ui.notify("已把 note 填入输入框，并标记为已消耗。", "info")
}

async function removeNote(args: string, ctx: ExtensionCommandContext): Promise<void> {
  const note = await pickNote(args, ctx)
  if (!note) return

  const store = await readStore()
  const nextNotes = store.notes.filter((item) => item.id !== note.id)
  await writeStore({ ...store, notes: nextNotes })
  ctx.ui.notify(`已删除 note：${preview(note.text)}`, "info")
}

async function clearNotes(args: string, ctx: ExtensionCommandContext): Promise<void> {
  const includeAll = isAllScope(args)
  const skipConfirm = args.split(/\s+/).includes("--yes")
  const scope = includeAll ? "所有目录" : "当前目录"
  const confirmed = skipConfirm || await ctx.ui.confirm(
    `清空${scope}的未发送 notes？`,
    includeAll ? "这会删除 /note 暂存区里的所有未发送内容。" : "这会删除当前目录下的未发送 notes。"
  )
  if (!confirmed) return

  const store = await readStore()
  const nextNotes = includeAll
    ? store.notes.filter((note) => note.sentAt)
    : store.notes.filter((note) => note.sentAt || note.cwd !== ctx.cwd)
  await writeStore({ ...store, notes: nextNotes })
  ctx.ui.notify(`已清空${scope}的未发送 notes。`, "info")
}

function help(ctx: ExtensionCommandContext): void {
  ctx.ui.notify([
    "note 命令：",
    "/note             选择当前目录的一条 note 并直接发送",
    "/note --all       从所有目录中选择一条未发送 note 并直接发送",
    "/note edit        选择当前目录的一条 note，填入输入框但不发送",
    "/note edit --all  从所有目录中选择一条 note，填入输入框但不发送",
    "/note <内容>      暂存一条 note，不发送给模型",
    "/note remove      选择并删除当前目录的一条未发送 note",
    "/note clear       清空当前目录的未发送 notes",
    "/note <cmd> --all 对所有目录生效，如 /note remove --all",
    "/note help          查看帮助",
  ].join("\n"), "info")
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("note", {
    description: "暂存开发过程中的临时笔记；/note 可选择一条直接发送",
    getArgumentCompletions: (prefix: string) => {
      const commands = [
        { value: "--all", label: "--all", description: "从所有目录中选择 note 并直接发送" },
        { value: "edit", label: "edit", description: "选择当前目录的 note 并填入输入框" },
        { value: "remove", label: "remove", description: "选择并删除当前目录的一条 note" },
        { value: "clear", label: "clear", description: "清空当前目录未发送 notes" },
        { value: "help", label: "help", description: "查看帮助" },
      ]
      const trimmedPrefix = prefix.trimStart()
      return commands.filter((item) => item.value.startsWith(trimmedPrefix))
    },
    handler: async (args, ctx) => {
      const input = args.trim()
      const [command = "", ...rest] = input.split(/\s+/)

      const commandArgs = rest.join(" ")

      if (!input) return sendNote("", ctx, pi)
      if (command === "--all") return sendNote(input, ctx, pi)
      if (command === "edit") return editNote(commandArgs, ctx)
      if (command === "help") return help(ctx)
      if (command === "remove" || command === "delete" || command === "rm") return removeNote(commandArgs, ctx)
      if (command === "clear") return clearNotes(commandArgs, ctx)

      return addNote(args, ctx)
    },
  })
}

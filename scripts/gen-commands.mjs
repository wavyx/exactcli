// Generates the command reference from the built oclif manifest:
//   - docs/commands.md (GitHub-facing)
// Run via `npm run docs:commands` (after `npm run build`). Do not hand-edit output.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const BIN = 'exactcli'

export function groupByTopic(manifest) {
  const commands = Object.values(manifest.commands)
    .filter((c) => !c.hidden)
    .sort((a, b) => a.id.localeCompare(b.id))
  const byTopic = {}
  for (const c of commands) {
    const topic = c.id.includes(':') ? c.id.split(':')[0] : '_root'
    ;(byTopic[topic] ??= []).push(c)
  }
  return { commands, byTopic }
}

const nonGlobalFlags = (c) =>
  Object.entries(c.flags || {}).filter(([, f]) => f.helpGroup !== 'GLOBAL')

// The global flags every command inherits (BaseCommand.baseFlags, tagged
// helpGroup:'GLOBAL'). Derived from the manifest so the reference intro can't
// drift from the code - no hand-kept list to forget a flag again.
// `withOptions` renders `--output`'s value enum inline (GitHub-facing style).
const globalFlagTokens = (manifest, { withOptions = false } = {}) => {
  const cmd = Object.values(manifest.commands).find((c) =>
    Object.values(c.flags || {}).some((f) => f.helpGroup === 'GLOBAL'),
  )
  return Object.entries(cmd?.flags || {})
    .filter(([, f]) => f.helpGroup === 'GLOBAL')
    .map(([name, f]) => {
      const opts = withOptions && f.options ? ` ${f.options.join('|')}` : ''
      return `\`--${name}${opts}\``
    })
}

// Join with an Oxford "and" before the last item: "a, b, and c".
const andList = (items) =>
  items.length > 1
    ? `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`
    : items.join('')

const argString = (c) =>
  Object.entries(c.args || {})
    .map(([name, a]) => (a.required ? ` <${name}>` : ` [${name}]`))
    .join('')

const exampleText = (e) =>
  (typeof e === 'string' ? e : e.command || '').replaceAll(
    '<%= config.bin %>',
    BIN,
  )

const flagLine = (name, f) => {
  const alias = f.char ? `-${f.char}, ` : ''
  const value =
    f.type === 'option' ? ` <${(f.options || []).join('|') || 'value'}>` : ''
  const required = f.required ? ' _(required)_' : ''
  return `- \`${alias}--${name}${value}\`${required} - ${f.description || ''}`.trimEnd()
}

export function renderGithubMarkdown(manifest, bin = BIN) {
  const { commands, byTopic } = groupByTopic(manifest)
  let out = `---
title: Commands
description: Full command reference for the exactcli command-line interface.
---

<!-- AUTO-GENERATED from the oclif manifest by scripts/gen-commands.mjs - do not edit by hand. -->

Reference for \`${bin}\` v${manifest.version} (${commands.length} commands). Every command also accepts the global flags ${andList(globalFlagTokens(manifest, { withOptions: true }))}.

`
  for (const topic of Object.keys(byTopic).sort()) {
    out += `## ${topic === '_root' ? 'Top-level' : `${bin} ${topic}`}\n\n`
    for (const c of byTopic[topic]) {
      const cmd = c.id.replaceAll(':', ' ')
      out += `### \`${bin} ${cmd}\`\n\n`
      if (c.description) out += `${c.description}\n\n`
      out += '```\n' + `${bin} ${cmd}${argString(c)} [flags]` + '\n```\n\n'
      const flags = nonGlobalFlags(c)
      if (flags.length)
        out += flags.map(([n, f]) => flagLine(n, f)).join('\n') + '\n\n'
      const examples = (c.examples || []).map(exampleText).filter(Boolean)
      if (examples.length)
        out += 'Examples:\n\n```bash\n' + examples.join('\n') + '\n```\n\n'
    }
  }
  return out
}

/* CLI entry - guarded so imports stay pure */
const invokedDirectly =
  process.argv[1] && import.meta.url === `file://${process.argv[1]}`

if (invokedDirectly) {
  const manifest = JSON.parse(
    readFileSync(new URL('../oclif.manifest.json', import.meta.url)),
  )
  mkdirSync(new URL('../docs/', import.meta.url), { recursive: true })
  writeFileSync(
    new URL('../docs/commands.md', import.meta.url),
    renderGithubMarkdown(manifest),
  )
  const count = groupByTopic(manifest).commands.length
  console.log(`Wrote docs/commands.md - ${count} commands`)
}

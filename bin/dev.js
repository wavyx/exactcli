#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execute } from '@oclif/core'

// Development launcher. It loads `./.env` so a contributor keeps the client id
// and the profile out of the shell profile. Only the keys of exactcli itself
// pass: any other key could name a binary that the CLI spawns, which would
// turn a `.env` in a working directory into arbitrary code execution.
const ENV_KEY_RE = /^EXACTCLI_[A-Z0-9_]+$/

const envFile = resolve(process.cwd(), '.env')
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    if (!ENV_KEY_RE.test(key)) continue
    const value = trimmed.slice(eq + 1).trim()
    if (!process.env[key]) process.env[key] = value
  }
}

await execute({ dir: import.meta.url })

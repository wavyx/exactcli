#!/usr/bin/env node
import { resolve } from 'node:path'
import { execute } from '@oclif/core'
import { loadDotEnv } from '../src/lib/dotenv.js'

// Development launcher. It loads `./.env` so a contributor keeps the client id
// and the profile out of the shell profile. See src/lib/dotenv.js for the
// keys that pass.
loadDotEnv(resolve(process.cwd(), '.env'))

await execute({ dir: import.meta.url })

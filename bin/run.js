#!/usr/bin/env node
import { execute } from '@oclif/core'

// The published launcher reads no `.env` file. A `.env` in the working
// directory would let any directory set the environment of the CLI, including
// the path of a binary that the CLI spawns. Export the variables in your
// shell instead. bin/dev.js keeps a loader for development.
await execute({ dir: import.meta.url })

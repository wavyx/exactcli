import { Flags } from '@oclif/core'
import { CliError } from './errors.js'

export const WRITE_METHODS = ['POST', 'PUT', 'DELETE']

/** Flags of every command that can write. */
export const writeFlags = {
  'allow-writes': Flags.boolean({
    description:
      'Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1',
    default: false,
  }),
  yes: Flags.boolean({ description: 'Confirm a DELETE', default: false }),
}

/**
 * @param {{ 'allow-writes'?: boolean }} flags
 * @returns {boolean}
 */
export const writesAllowed = (flags) =>
  Boolean(flags['allow-writes']) || process.env.EXACTCLI_ALLOW_WRITES === '1'

/**
 * Refuse before anything is read or sent: a refused write costs nothing.
 * @param {{ 'allow-writes'?: boolean, yes?: boolean }} flags
 * @param {string} method
 */
export function assertWritesAllowed(flags, method) {
  if (!WRITE_METHODS.includes(method)) return
  if (!writesAllowed(flags)) {
    throw new CliError(
      'Writes are off. Add --allow-writes (and --yes for DELETE).',
      { exitCode: 77 },
    )
  }
  if (method === 'DELETE' && !flags.yes) {
    throw new CliError('DELETE needs --yes.', { exitCode: 77 })
  }
}

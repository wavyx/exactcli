/**
 * oclif runs this hook when it cannot resolve a command id. It returns instead
 * of throwing, so oclif prints no second "command not found" of its own.
 * @param {{ id: string, argv: string[] }} options
 * @returns {Promise<void>}
 */
export default async function commandNotFound({ id }) {
  process.stderr.write(`Command "${id}" not found. Run: exactcli --help\n`)
  process.exitCode = 127
}

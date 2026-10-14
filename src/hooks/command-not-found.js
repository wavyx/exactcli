import { getAlias, MAX_ALIAS_HOPS } from '../lib/aliases.js'

/**
 * The aliases expanded in this process. The hook comes back here through
 * runCommand when an alias names another alias, so the set sees the chain.
 */
const chain = new Set()

/**
 * The command id that covers the most words of argv, and the words left.
 * @param {string[]} argv
 * @param {{ findCommand: (id: string) => unknown }} config
 * @returns {{ id: string, rest: string[] }}
 */
function splitCommand(argv, config) {
  for (let i = argv.length; i > 1; i--) {
    const id = argv.slice(0, i).join(':')
    if (config.findCommand(id)) return { id, rest: argv.slice(i) }
  }
  return { id: argv[0], rest: argv.slice(1) }
}

/**
 * Run an alias: its words, then the words typed after it. The exit code of
 * the command becomes the exit code of the process.
 * @param {string} name
 * @param {string[]} words
 * @param {{ runCommand: Function, findCommand: Function }} config
 */
async function runAlias(name, words, config) {
  if (chain.has(name) || chain.size >= MAX_ALIAS_HOPS) {
    process.stderr.write(
      `Alias expansion stopped: ${[...chain, name].join(' -> ')}\n`,
    )
    process.exitCode = 64
    return
  }
  const root = chain.size === 0
  chain.add(name)
  try {
    const { id, rest } = splitCommand(words, config)
    await config.runCommand(id, rest)
  } catch (err) {
    // A command that printed its error already exits with EEXIT; any other
    // error reaches no oclif handler from here, so print it.
    if (err.code !== 'EEXIT' && err.message) {
      process.stderr.write(`Error: ${err.message}\n`)
    }
    const code = err.exitCode ?? err.oclif?.exit
    process.exitCode = code === 2 ? 64 : (code ?? 1)
  } finally {
    if (root) chain.clear()
  }
}

/**
 * oclif runs this hook when it cannot resolve a command id. An alias runs
 * its command; anything else is an unknown command. The hook returns instead
 * of throwing, so oclif prints no second "command not found" of its own.
 * @param {{ id: string, argv?: string[], config: object }} options
 * @returns {Promise<void>}
 */
export default async function commandNotFound({ id, argv = [], config }) {
  // With a space separator, "unpaid --all" arrives as unpaid, and "unpaid x"
  // as unpaid:x: the first word is the alias name.
  const [name, ...extra] = id.split(':')
  const alias = getAlias(name)
  if (alias) {
    await runAlias(name, [...alias, ...extra, ...argv], config)
    return
  }
  process.stderr.write(
    `Command "${id.replace(/:/g, ' ')}" not found. Run: exactcli --help\n`,
  )
  process.exitCode = 127
}

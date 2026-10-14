import { getConf } from './config.js'
import { CliError } from './errors.js'
import { withLock } from './lock.js'

/** One path-free word: it becomes a command id and a config key. */
const NAME_RE = /^[A-Za-z][A-Za-z0-9_-]*$/
/** Expansion depth: past it, a chain is a mistake or a missed cycle. */
export const MAX_ALIAS_HOPS = 10
/** The words that make a command write or delete. */
const WRITE_WORDS =
  /^(--allow-writes|--yes|create|update|delete|line-add|line-update|line-delete|upsert)$/

/** @returns {Record<string, string[]>} */
export function getAliases() {
  return getConf().get('aliases')
}

/**
 * @param {string} name
 * @returns {string[] | undefined}
 */
export function getAlias(name) {
  return Object.hasOwn(getAliases(), name) ? getAliases()[name] : undefined
}

/**
 * Write the whole object under one key: conf splits a dotted key path, so a
 * per-alias key would nest. Two processes that change aliases at once take
 * the lock in turn.
 * @param {(aliases: Record<string, string[]>) => void} change
 */
function update(change) {
  return withLock(
    'aliases',
    () => {
      const aliases = { ...getAliases() }
      change(aliases)
      getConf().set('aliases', aliases)
    },
    { waitMs: 2000, staleMs: 5000 },
  )
}

/**
 * @param {string} name
 * @param {string[]} argv
 */
export const setAlias = (name, argv) =>
  update((aliases) => {
    aliases[name] = argv
  })

/** @param {string} name */
export const unsetAlias = (name) =>
  update((aliases) => {
    delete aliases[name]
  })

/**
 * The argv of an alias: one quoted argument is split on spaces, several
 * arguments stay as they are (so a value with a space survives).
 * @param {string[]} words
 * @returns {string[]}
 */
export function aliasArgv(words) {
  return words.length === 1 ? words[0].split(/\s+/).filter(Boolean) : words
}

/**
 * Check a new alias before it is stored. Refuses a bad name, a name that
 * hides a command or a topic, an empty command and a cycle.
 * @param {string} name
 * @param {string[]} argv
 * @param {{ findCommand: (id: string) => unknown, findTopic: (id: string) => unknown }} config
 * @param {Record<string, string[]>} aliases the stored aliases
 * @returns {{ writes: boolean }} whether the alias can write
 */
export function checkAlias(name, argv, config, aliases) {
  const refuse = (why) => {
    throw new CliError(`Cannot create alias ${name}: ${why}`, { exitCode: 64 })
  }
  if (!NAME_RE.test(name)) {
    refuse('use letters, digits, - and _, starting with a letter')
  }
  if (config.findCommand(name)) refuse('it hides an exactcli command')
  if (config.findTopic(name)) refuse('it hides an exactcli topic')
  if (argv.length === 0) refuse('the command is empty')

  // Follow the first word through the stored aliases: back at the new name
  // means the expansion would never end.
  const seen = [name]
  let word = argv[0]
  for (let hop = 0; hop < MAX_ALIAS_HOPS; hop++) {
    if (word === name)
      refuse(`it forms a cycle (${[...seen, name].join(' -> ')})`)
    if (!Object.hasOwn(aliases, word) || seen.includes(word)) break
    seen.push(word)
    word = aliases[word][0]
  }
  return { writes: argv.some((w) => WRITE_WORDS.test(w)) }
}

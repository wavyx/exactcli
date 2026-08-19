import { Args, Flags } from '@oclif/core'
import BaseCommand from '../base-command.js'
import { resolveBody } from '../lib/body.js'
import { CliError } from '../lib/errors.js'
import { autoColumns, divisionPath, substituteDivision } from '../lib/odata.js'
import { collectPages } from '../lib/pagination.js'

/** Method -> the client call that carries it. */
const CALLS = {
  GET: (client, path, options) => client.get(path, options),
  POST: (client, path, options, body) => client.post(path, body, options),
  PUT: (client, path, options, body) => client.put(path, body, options),
  DELETE: (client, path, options) => client.del(path, options),
}

const METHODS = Object.keys(CALLS)

/**
 * Turn the repeatable `--query key=value` flag into a query object. The first
 * `=` separates the two, so a value may contain more of them.
 * @param {string[]} [pairs]
 * @returns {Record<string, string>}
 */
function parseQuery(pairs = []) {
  const query = {}
  for (const pair of pairs) {
    const separator = pair.indexOf('=')
    if (separator < 1) {
      throw new CliError(`--query expects key=value, received: ${pair}`, {
        exitCode: 64,
      })
    }
    query[pair.slice(0, separator)] = pair.slice(separator + 1)
  }
  return query
}

export default class ApiCommand extends BaseCommand {
  static description = 'Make a raw API request (host-locked to Exact Online)'

  static examples = [
    '<%= config.bin %> api GET crm/Accounts',
    '<%= config.bin %> api GET /api/v1/current/Me',
    '<%= config.bin %> api GET "/api/v1/{division}/crm/Accounts" --query \'$top=5\'',
    '<%= config.bin %> api POST crm/Accounts --body \'{"Name":"Acme"}\'',
    '<%= config.bin %> api PUT "crm/Accounts(guid\'<id>\')" --body @patch.json',
    '<%= config.bin %> api GET logistics/Items --paginate --output json',
    '<%= config.bin %> api GET logistics/Items --paginate --max-pages 20',
  ]

  static args = {
    method: Args.string({
      required: true,
      description: 'HTTP method: GET, POST, PUT or DELETE',
    }),
    path: Args.string({
      required: true,
      description:
        'Resource path (crm/Accounts), a full /api/ path, or a path with {division}',
    }),
  }

  static flags = {
    body: Flags.string({
      description: 'Request body (JSON string, @file, or piped stdin)',
    }),
    query: Flags.string({
      multiple: true,
      description: 'Query parameter as key=value (repeatable)',
    }),
    paginate: Flags.boolean({
      description:
        'Follow __next and collect every d.results into one array (GET only)',
    }),
    'max-pages': Flags.integer({
      description: 'Maximum number of pages to read with --paginate',
      default: 100,
      min: 1,
    }),
  }

  /**
   * Where to send the request. `{division}` wins, a full `/api/` path travels
   * as it is, and anything else is a resource path under the division.
   * @param {string} rawPath
   * @returns {string}
   */
  resolvePath(rawPath) {
    if (rawPath.includes('{division}')) {
      return substituteDivision(rawPath, this.resolveDivision())
    }
    if (rawPath.startsWith('/api/')) return rawPath
    return divisionPath(this.resolveDivision(), rawPath)
  }

  async run() {
    const { args } = await this.parse(ApiCommand)
    const method = args.method.toUpperCase()

    if (!METHODS.includes(method)) {
      throw new CliError(
        `Unsupported method ${args.method}. Allowed: ${METHODS.join(', ')}`,
        { exitCode: 64 },
      )
    }
    if (this.flags.paginate && method !== 'GET') {
      throw new CliError('--paginate is only valid with GET', { exitCode: 64 })
    }

    const path = this.resolvePath(args.path)
    const query = parseQuery(this.flags.query)

    if (this.flags.paginate) {
      const rows = await collectPages(
        this.apiClient.pageOData(path, query, {
          maxPages: this.flags['max-pages'],
        }),
        this.flags.limit,
      )
      // A `__next` that survives the walk means the server has more to give.
      // It goes to stderr, so a piped stdout stays parseable.
      if (this.apiClient.lastNext) {
        process.stderr.write('More results available. Raise --max-pages.\n')
      }
      await this.outputResults(rows, autoColumns(rows))
      return
    }

    let body
    if (method === 'POST' || method === 'PUT') {
      const text = await resolveBody(this.flags)
      try {
        body = JSON.parse(text)
      } catch (cause) {
        throw new CliError(`--body is not valid JSON: ${cause.message}`, {
          exitCode: 64,
        })
      }
    }

    const response = await CALLS[method](this.apiClient, path, { query }, body)

    // The envelope passes through untouched: this is the escape hatch, so no
    // unwrap and no normalize. A 204 carries no body, so report the success.
    await this.outputResults(response ?? { ok: true }, {})
  }
}

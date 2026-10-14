import { Flags } from '@oclif/core'
import { password } from '@inquirer/prompts'
import BaseCommand from '../../base-command.js'
import { getProfileConfig, normalizeDomain } from '../../lib/config.js'
import { ConfigError } from '../../lib/errors.js'
import { startTunnel } from '../../lib/ngrok.js'
import { divisionPath, unwrap } from '../../lib/odata.js'
import { startWebhookServer } from '../../lib/webhooks.js'
import { assertWritesAllowed, writeFlags } from '../../lib/writes.js'

const RESOURCE = 'webhooks/WebhookSubscriptions'
/** Exact wants the callback on the domain of the redirect URI. */
const CALLBACK_PATH = '/callback'

export default class WebhookListenCommand extends BaseCommand {
  static description =
    `Subscribe to webhook topics and print each verified notification as a ` +
    `JSON line (POST ${RESOURCE}, DELETE ${RESOURCE} on exit)`

  static examples = [
    '<%= config.bin %> webhook listen --topic Accounts --allow-writes',
    '<%= config.bin %> webhook listen --topic SalesInvoices --topic Items --max-events 10 --allow-writes',
  ]

  /** The signals that end the run; a test swaps them for a harmless one. */
  static signals = ['SIGINT', 'SIGTERM']

  static flags = {
    ...writeFlags,
    topic: Flags.string({
      required: true,
      multiple: true,
      description: 'Topic, for example Accounts or SalesInvoices (repeatable)',
    }),
    port: Flags.integer({
      description: 'Local port of the receiver',
      default: 9998,
      min: 0,
      max: 65535,
    }),
    'ngrok-domain': Flags.string({
      description:
        'Reserved ngrok domain; defaults to the one of the profile (the ' +
        'domain of the redirect URI)',
    }),
    'max-events': Flags.integer({
      description: 'Stop after this many notifications',
      min: 1,
    }),
    keep: Flags.boolean({
      description: 'Keep the subscriptions when the command stops',
      default: false,
    }),
  }

  async run() {
    const { flags } = this
    // The subscriptions are writes: a refused one starts nothing.
    assertWritesAllowed(flags, 'POST')
    // A pasted domain often carries the scheme and a trailing slash.
    const domain =
      flags['ngrok-domain'] === undefined
        ? getProfileConfig(this.activeProfile, 'ngrok_domain')
        : normalizeDomain(flags['ngrok-domain'])
    if (!domain) {
      throw new ConfigError(
        'No ngrok domain: pass --ngrok-domain or run exactcli auth login',
      )
    }
    // Resolved before the server starts: a missing division leaves nothing
    // open behind it.
    const base = divisionPath(this.resolveDivision(), RESOURCE)
    const secret =
      process.env.EXACTCLI_WEBHOOK_SECRET ||
      (await password({
        message: 'Webhook secret of the app this profile signs in with:',
      }))
    // An empty key would let anyone sign a notification.
    if (!secret.trim()) {
      throw new ConfigError('The webhook secret is empty')
    }

    let stopping = false
    let stop
    const stopped = new Promise((resolve) => {
      stop = () => {
        stopping = true
        resolve()
      }
    })
    let received = 0
    const server = await startWebhookServer({
      port: flags.port,
      path: CALLBACK_PATH,
      secret,
      onEvent: (content) => {
        this.log(JSON.stringify(content))
        received++
        if (flags['max-events'] && received >= flags['max-events']) stop()
      },
      onInvalid: (reason) =>
        process.stderr.write(`Refused a notification: ${reason}\n`),
    })
    const subscriptions = []
    let tunnel
    // The handlers come first: a Ctrl+C during the set-up still reaches the
    // finally block, which removes what this run created. The removal needs
    // no --yes: it touches only the subscriptions of this run.
    for (const signal of WebhookListenCommand.signals) {
      process.once(signal, stop)
    }
    try {
      // Exact validates a new subscription with a call to the callback, so
      // the tunnel must be up first.
      tunnel = await startTunnel({ domain, port: server.port })
      for (const topic of flags.topic) {
        if (stopping) break
        const record = unwrap(
          await this.apiClient.post(base, {
            Topic: topic,
            CallbackURL: `https://${domain}${CALLBACK_PATH}`,
          }),
        )
        subscriptions.push(record.ID)
        process.stderr.write(`Subscribed to ${topic} (${record.ID})\n`)
      }
      if (!stopping) {
        process.stderr.write('Listening. Press Ctrl+C to stop.\n')
      }
      await stopped
    } finally {
      for (const signal of WebhookListenCommand.signals) {
        process.off(signal, stop)
      }
      if (!flags.keep) await this.#unsubscribe(base, subscriptions)
      tunnel?.stop()
      await server.close()
    }
  }

  /**
   * Remove the subscriptions of this run. Best effort: a failure names the
   * subscription, so that `webhook delete` can remove it later.
   * @param {string} base
   * @param {string[]} ids
   */
  async #unsubscribe(base, ids) {
    for (const id of ids) {
      try {
        await this.apiClient.del(`${base}(guid'${id}')`)
      } catch (err) {
        this.warn(
          `Subscription ${id} stays active (${err.message}). ` +
            `Run: exactcli webhook delete ${id}`,
        )
      }
    }
  }
}

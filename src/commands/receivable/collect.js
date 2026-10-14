import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { CliError } from '../../lib/errors.js'
import { divisionPath, unwrap } from '../../lib/odata.js'
import { GUID_RE } from '../../lib/refs.js'
import {
  assertWritesAllowed,
  describeRequest,
  validateWrite,
  writeFlags,
} from '../../lib/writes.js'

const RESOURCE = 'cashflow/Receivables'
/** PaymentMethod I: Exact collects the receivable by direct debit. */
const COLLECTION = 'I'
const NUMBER_RE = /^\d{1,10}$/

export default class ReceivableCollectCommand extends BaseCommand {
  static description =
    'Prepare receivables for a direct debit collection: payment method I, ' +
    `optionally a mandate and a payment reference (PUT ${RESOURCE})`

  static examples = [
    '<%= config.bin %> receivable collect 26700002 --dry-run',
    '<%= config.bin %> receivable collect <receivable-id> --mandate <mandate-id> --allow-writes',
  ]

  /** One receivable per argument, as many as needed. */
  static strict = false

  static args = {
    ref: Args.string({
      required: true,
      description:
        'Receivable GUID, or the invoice number of one open receivable ' +
        '(repeat for more)',
    }),
  }

  static flags = {
    ...writeFlags,
    mandate: Flags.string({
      description: 'Direct debit mandate GUID (mandate list shows them)',
    }),
    reference: Flags.string({
      description: 'Payment reference for the bank file (one receivable only)',
    }),
    description: Flags.string({ description: 'Description' }),
    'dry-run': Flags.boolean({
      description: 'Show the validated requests and send nothing',
      default: false,
    }),
  }

  async run() {
    const { argv } = await this.parse(ReceivableCollectCommand)
    const { flags } = this
    const dryRun = flags['dry-run']
    const bad = argv.find((r) => !GUID_RE.test(r) && !NUMBER_RE.test(r))
    if (bad !== undefined) {
      throw new CliError(
        `Expected a GUID or an invoice number, received ${bad}`,
        { exitCode: 64 },
      )
    }
    if (flags.mandate !== undefined && !GUID_RE.test(flags.mandate)) {
      throw new CliError(
        `--mandate expects a GUID, received ${flags.mandate}`,
        {
          exitCode: 64,
        },
      )
    }
    const body = { PaymentMethod: COLLECTION }
    if (flags.mandate) body.DirectDebitMandate = flags.mandate
    if (flags.reference !== undefined) body.PaymentReference = flags.reference
    if (flags.description !== undefined) body.Description = flags.description
    validateWrite({ resource: RESOURCE, body, method: 'PUT' })
    // A refused write costs no call at all. A dry run needs no permission.
    if (!dryRun) assertWritesAllowed(flags, 'PUT')

    const base = divisionPath(this.resolveDivision(), RESOURCE)
    const resolved = []
    for (const ref of argv) {
      resolved.push(
        GUID_RE.test(ref)
          ? ref.toLowerCase()
          : await this.#byInvoice(base, ref),
      )
    }
    const ids = [...new Set(resolved)]
    // One reference text on several receivables would make them all alike.
    if (flags.reference !== undefined && ids.length > 1) {
      throw new CliError('--reference fits one receivable only', {
        exitCode: 64,
      })
    }
    const requests = ids.map((id) =>
      describeRequest({ method: 'PUT', path: `${base}(guid'${id}')`, body }),
    )
    if (dryRun) {
      await this.outputResults(requests, {})
      return
    }
    const done = []
    for (const request of requests) {
      try {
        await this.apiClient.put(request.path, body)
      } catch (err) {
        if (done.length > 0) {
          process.stderr.write(
            `Prepared before the failure: ${done.join(', ')}\n`,
          )
        }
        throw err
      }
      done.push(ids[done.length])
    }
    await this.outputAction(
      { collected: done },
      `Prepared ${done.length} receivables for collection`,
    )
  }

  /** The one open receivable of an invoice number. */
  async #byInvoice(base, number) {
    const rows = unwrap(
      await this.apiClient.get(base, {
        query: {
          $filter: `InvoiceNumber eq ${number} and IsFullyPaid eq false`,
          $select: 'ID',
        },
      }),
    )
    if (rows.length !== 1) {
      throw new CliError(
        rows.length === 0
          ? `No open receivable for invoice ${number}`
          : `Invoice ${number} has ${rows.length} open receivables: use the GUID of one`,
        { exitCode: 65 },
      )
    }
    return String(rows[0].ID).toLowerCase()
  }
}

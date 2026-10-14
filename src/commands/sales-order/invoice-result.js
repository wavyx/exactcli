import { Args } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import {
  assertProcessId,
  readInvoiceResult,
  RESULT_RESOURCE,
} from '../../lib/invoice-result.js'
import { autoColumns } from '../../lib/odata.js'

export default class SalesOrderInvoiceResultCommand extends BaseCommand {
  static description = `Read the result of a queued sales order invoicing run (GET ${RESULT_RESOURCE})`

  static examples = [
    '<%= config.bin %> sales-order invoice-result <process-id>',
    '<%= config.bin %> sales-order invoice-result <process-id> --output json',
  ]

  static args = {
    process: Args.string({
      required: true,
      description: 'ProcessID that sales-order invoice printed (a GUID)',
    }),
  }

  async run() {
    const { args } = await this.parse(SalesOrderInvoiceResultCommand)
    assertProcessId(args.process)
    const result = await readInvoiceResult(
      this,
      this.resolveDivision(),
      args.process,
    )
    await this.outputResults(result, autoColumns([result]))
  }
}

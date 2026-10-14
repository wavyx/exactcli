import { CliError } from './errors.js'
import { divisionPath, normalize, unwrap } from './odata.js'
import { GUID_RE } from './refs.js'

/** The function endpoint that reports a queued InvoiceSalesOrders run. */
export const RESULT_RESOURCE = 'read/salesinvoice/InvoiceSalesOrderResult'

/** The statuses of the background job, as Exact documents them. */
export const RESULT_STATUS = {
  20: 'Waiting',
  30: 'Busy',
  40: 'Technical error',
  50: 'Finished',
  52: 'Functional error',
}

/** The statuses that end a run; the others mean "ask again later". */
const FINAL = new Set([40, 50, 52])
const FAILED = new Set([40, 52])

/**
 * The status code of a result. The reference documents codes, but Exact
 * answers the text, for example "Finished" [live 2026-10-14]: take both.
 * @param {unknown} status
 * @returns {number | null}
 */
export function statusCode(status) {
  if (/^\d+$/.test(String(status))) return Number(status)
  const text = String(status).replace(/\s+/g, '').toLowerCase()
  const entry = Object.entries(RESULT_STATUS).find(
    ([, name]) => name.replace(/\s+/g, '').toLowerCase() === text,
  )
  return entry ? Number(entry[0]) : null
}

/** The clock of the wait loop; a test replaces it. */
export const timing = {
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}

/**
 * Check a process ID before it lands in the query: anything but a GUID could
 * close the literal and add its own clause.
 * @param {string} id
 */
export function assertProcessId(id) {
  if (!GUID_RE.test(id)) {
    throw new CliError(`A process ID is a GUID, received: ${id}`, {
      exitCode: 64,
    })
  }
}

/**
 * Read the result of one queued run, with the status as text.
 * @param {{ apiClient: object }} cmd
 * @param {number} division
 * @param {string} processId checked by assertProcessId
 * @returns {Promise<object>}
 */
export async function readInvoiceResult(cmd, division, processId) {
  const path = divisionPath(division, RESULT_RESOURCE)
  // A function endpoint: the parameter travels as a plain query value.
  const body = await cmd.apiClient.get(path, {
    query: { ProcessID: `guid'${processId}'` },
  })
  const data = unwrap(body)
  const [row] = Array.isArray(data) ? data : [data]
  if (!row) {
    throw new CliError(`No result for process ${processId}`, { exitCode: 65 })
  }
  const record = normalize(row)
  return {
    ...record,
    StatusDescription: RESULT_STATUS[statusCode(record.Status)] ?? null,
  }
}

/**
 * Ask for the result until the run ends or the time runs out. The calls run
 * one after the other, `intervalMs` apart, to stay inside the rate limit.
 * @param {{ apiClient: object }} cmd
 * @param {number} division
 * @param {string} processId
 * @param {{ intervalMs: number, timeoutMs: number }} options
 * @returns {Promise<object>} the final result
 */
export async function waitForInvoiceResult(
  cmd,
  division,
  processId,
  { intervalMs, timeoutMs },
) {
  const deadline = Date.now() + timeoutMs
  const unknown = new Set()
  for (;;) {
    await timing.sleep(intervalMs)
    const result = await readInvoiceResult(cmd, division, processId)
    const code = statusCode(result.Status)
    if (FINAL.has(code)) return result
    // A status Exact does not document may be final: say so once, and wait.
    if (code === null && !unknown.has(result.Status)) {
      unknown.add(result.Status)
      process.stderr.write(
        `Unknown status ${result.Status}: waiting until --wait-timeout\n`,
      )
    }
    if (Date.now() >= deadline) {
      throw new CliError(
        `Process ${processId} is still ${result.StatusDescription ?? result.Status}. ` +
          `Run later: exactcli sales-order invoice-result ${processId}`,
        { exitCode: 75 },
      )
    }
  }
}

/**
 * The error for a run that ended badly or left invoices out, or null when
 * every invoice was created.
 * @param {object} result
 * @returns {CliError | null}
 */
export function resultError(result) {
  const failed = Number(result.NumberOfFailedInvoices ?? 0)
  if (!FAILED.has(statusCode(result.Status)) && failed === 0) return null
  return new CliError(
    `Invoicing ended with status ${result.Status} (${failed} failed invoices): ${result.Errors || 'no detail'}`,
    { exitCode: 65 },
  )
}

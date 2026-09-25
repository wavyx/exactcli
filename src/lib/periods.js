import { CliError } from './errors.js'
import { divisionPath, unwrap } from './odata.js'

const PERIODS = 'financial/FinancialPeriods'

/** @returns {string} the local date of today, YYYY-MM-DD */
export function today() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/**
 * The financial year and period that cover a date, from the periods of the
 * administration: a financial year need not follow the calendar.
 * @param {{ apiClient: object, resolveDivision: () => number }} cmd
 * @param {string} date YYYY-MM-DD
 * @returns {Promise<{ FinancialYear: number, FinancialPeriod: number }>}
 */
export async function financialPeriod(cmd, date) {
  const answer = await cmd.apiClient.get(
    divisionPath(cmd.resolveDivision(), PERIODS),
    {
      query: {
        $filter: `StartDate le datetime'${date}' and EndDate ge datetime'${date}'`,
        $select: 'FinYear,FinPeriod',
        $top: 1,
      },
    },
  )
  const [period] = unwrap(answer)
  if (!period) {
    throw new CliError(
      `No financial period covers ${date}: create the financial year first`,
      { exitCode: 65 },
    )
  }
  return { FinancialYear: period.FinYear, FinancialPeriod: period.FinPeriod }
}

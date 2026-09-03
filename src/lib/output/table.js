import Table from 'cli-table3'
import chalk from 'chalk'

/**
 * @typedef {object} Column
 * @property {string} header
 * @property {(row: object) => string} [get]
 * @property {string} [key]
 * @property {number} [minWidth]
 */

/**
 * @param {object[]} data
 * @param {Record<string, Column>} columns
 * @returns {string}
 */
export function formatTable(data, columns) {
  if (!data || data.length === 0) {
    return chalk.dim('No results found.')
  }

  const entries = Object.entries(columns)

  const table = new Table({
    head: entries.map(([, col]) => chalk.bold(col.header)),
    style: { head: [], border: [] },
  })

  for (const row of data) {
    table.push(
      entries.map(([fieldKey, col]) => {
        // Exact pads codes with spaces to a fixed width: trim for the eye.
        if (col.get) return String(col.get(row) ?? '').trim()
        const value = row[col.key ?? fieldKey]
        return value != null ? String(value).trim() : ''
      }),
    )
  }

  return table.toString()
}

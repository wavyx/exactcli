import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { CliError } from './errors.js'
import { divisionPath } from './odata.js'

const CATALOG_PATH = fileURLToPath(
  new URL('../data/catalog.json.gz', import.meta.url),
)
const GUID_TYPE = 'Edm.Guid'
const DATE_TYPE = 'Edm.DateTime'
/** Columns a reader looks for first, in this order, when the resource has them. */
const NAME_ORDER = [
  'Code',
  'Name',
  'Description',
  'FullName',
  'Subject',
  'EntryNumber',
  'InvoiceNumber',
  'Status',
  'StatusDescription',
]
const AMOUNT_RE = /Amount|Total|Price|Quantity/
const MAX_COLUMNS = 8
/** Search ranking: the family a user wants first when names tie. */
const FAMILY_ORDER = ['regular', 'current', 'beta', 'sync', 'bulk', 'read']

let cached
let cachedIndex

/**
 * Load the shipped catalogue once. A path is for tests: a plain JSON fixture
 * loads too.
 * @param {string} [path]
 * @returns {{generatedAt: string, source: string, count: number, resources: object[]}}
 */
export function loadCatalog(path = CATALOG_PATH) {
  if (cached) return cached
  const raw = readFileSync(path)
  const text = path.endsWith('.gz')
    ? gunzipSync(raw).toString('utf8')
    : raw.toString('utf8')
  cached = JSON.parse(text)
  cachedIndex = buildIndex(cached)
  return cached
}

/** Forget the loaded catalogue (tests switch between fixture and real). */
export function resetCatalog() {
  cached = undefined
  cachedIndex = undefined
}

const buildIndex = (catalog) =>
  new Map(catalog.resources.map((r) => [catalogKey(r.uri), r]))

/**
 * Normalise any accepted reference to the lookup key of the catalogue:
 * lowercase, no /api/v1 prefix, the division replaced by `{division}`, no
 * key suffix, no query string.
 * @param {string} ref
 * @returns {string}
 */
export function catalogKey(ref) {
  let s = String(ref)
    .trim()
    .split('?')[0]
    .replace(/\([^)]*\)$/, '')
    .replace(/^\/+/, '')
    .replace(/^api\/v1\//i, '')
    .replace(
      /^(beta\/)?(\d+|\{division\})\//i,
      (_m, beta) => `${beta ? 'beta/' : ''}{division}/`,
    )
    .toLowerCase()
  if (s.startsWith('current/')) return s
  if (s.startsWith('beta/') && !s.startsWith('beta/{division}/')) {
    s = `beta/{division}/${s.slice(5)}`
  }
  if (!s.startsWith('{division}/') && !s.startsWith('beta/')) {
    s = `{division}/${s}`
  }
  return s
}

const indexOf = (catalog) =>
  catalog === cached ? cachedIndex : buildIndex(catalog)

/**
 * @param {string} ref
 * @param {object} [catalog]
 * @returns {object | undefined}
 */
export function findResource(ref, catalog = loadCatalog()) {
  return indexOf(catalog).get(catalogKey(ref))
}

/**
 * Resources that match a word: by resource name first, then by service or
 * uri, then by a property name or description.
 * @param {string} word
 * @param {object} [catalog]
 * @returns {object[]}
 */
export function searchResources(word, catalog = loadCatalog()) {
  const needle = word.toLowerCase()
  const has = (s) => (s ?? '').toLowerCase().includes(needle)
  const score = (r) => {
    if (has(r.resource)) return 0
    if (has(r.service) || has(r.uri)) return 1
    if (r.properties.some((p) => has(p.name) || has(p.description))) return 2
    return -1
  }
  return catalog.resources
    .map((r) => ({ score: score(r), r }))
    .filter(({ score }) => score >= 0)
    .sort(
      (a, b) =>
        a.score - b.score ||
        FAMILY_ORDER.indexOf(a.r.family) - FAMILY_ORDER.indexOf(b.r.family) ||
        a.r.uri.localeCompare(b.r.uri),
    )
    .map(({ r }) => r)
}

const visible = (res) =>
  res.properties.filter((p) => !p.hidden && !p.navigation)

/** @param {object} res @returns {string[]} */
export const mandatoryFields = (res) =>
  res.properties.filter((p) => p.mandatory).map((p) => p.name)

/** @param {object} res @returns {string[]} */
export const filterableFields = (res) =>
  res.properties.filter((p) => p.filter === 'yes').map((p) => p.name)

/** @param {object} res @returns {'guid' | 'plain'} */
export const keyType = (res) =>
  res.properties.find((p) => p.key)?.type === GUID_TYPE ? 'guid' : 'plain'

/**
 * The columns a table shows by default: keys, then the names a reader looks
 * for, then dates, then amounts, then the rest, eight at most.
 * @param {object} res
 * @returns {string[]}
 */
export function defaultColumns(res) {
  const props = visible(res)
  const names = props.map((p) => p.name)
  const picked = []
  const take = (name) => {
    if (names.includes(name) && !picked.includes(name)) picked.push(name)
  }
  res.keys.forEach(take)
  NAME_ORDER.forEach(take)
  props.filter((p) => p.type === DATE_TYPE).forEach((p) => take(p.name))
  props.filter((p) => AMOUNT_RE.test(p.name)).forEach((p) => take(p.name))
  names.forEach(take)
  return picked.slice(0, MAX_COLUMNS)
}

/**
 * Check a typed descriptor against the catalogue. Throws a plain Error that
 * names the resource and every unknown column and filter field.
 * @param {{resource: string, columns?: string[], filters?: object}} descriptor
 * @param {object} [catalog]
 */
export function validateDescriptor(descriptor, catalog = loadCatalog()) {
  const res = findResource(descriptor.resource, catalog)
  if (!res) throw new Error(`unknown resource ${descriptor.resource}`)
  const names = new Set(res.properties.map((p) => p.name))
  const badColumns = (descriptor.columns ?? []).filter((c) => !names.has(c))
  const badFields = Object.values(descriptor.filters ?? {})
    .map((f) => f.field)
    .filter((f) => !names.has(f))
  if (badColumns.length || badFields.length) {
    throw new Error(
      `${descriptor.resource}: unknown columns ${badColumns.join(',') || '-'}; ` +
        `unknown filter fields ${badFields.join(',') || '-'}`,
    )
  }
}

/**
 * The request path for a reference, plus its catalogue record when known.
 * `current/...` needs no division. A `beta/` prefix or the beta option
 * selects the beta namespace. Everything else goes under the division.
 * @param {number|string} division
 * @param {string} ref
 * @param {{beta?: boolean}} [options]
 * @param {object} [catalog]
 * @returns {{path: string, resource: object | undefined}}
 */
export function resolvePath(
  division,
  ref,
  { beta = false } = {},
  catalog = loadCatalog(),
) {
  const resource = findResource(ref, catalog)
  const clean = String(ref).replace(/^\/+/, '')
  if (/^current\//i.test(clean)) return { path: `/api/v1/${clean}`, resource }
  const isBeta = beta || /^beta\//i.test(clean)
  const rest = clean.replace(/^beta\//i, '')
  if (!rest.includes('/')) {
    throw new CliError('Resource must look like service/Resource', {
      exitCode: 64,
    })
  }
  return { path: divisionPath(division, rest, { beta: isBeta }), resource }
}

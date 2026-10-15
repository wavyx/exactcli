import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { CliError } from './errors.js'
import { divisionPath } from './odata.js'

const CATALOG_PATH = fileURLToPath(
  new URL('../data/catalog.json.gz', import.meta.url),
)
/** Hand-written records for resources the documentation does not list. */
const EXTRAS_PATH = fileURLToPath(
  new URL('../data/catalog-extras.json', import.meta.url),
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
/** Dates a reader wants when the resource has them; other dates are noise. */
const DATE_ORDER = [
  'Date',
  'EntryDate',
  'DocumentDate',
  'InvoiceDate',
  'OrderDate',
  'Created',
  'Modified',
]
const AMOUNT_RE = /Amount|Total|Price|Quantity/
const MAX_COLUMNS = 8
/** Search ranking: the family a user wants first when names tie. */
const FAMILY_ORDER = ['regular', 'current', 'beta', 'sync', 'bulk', 'read']

let cached
let cachedIndex

/**
 * Load the shipped catalogue once, plus the extras file. A path is for
 * tests: a plain JSON fixture loads too; an empty extrasPath skips extras.
 * @param {string} [path]
 * @param {string} [extrasPath]
 * @returns {{generatedAt: string, source: string, count: number, resources: object[]}}
 */
export function loadCatalog(path = CATALOG_PATH, extrasPath = EXTRAS_PATH) {
  if (cached) return cached
  const raw = readFileSync(path)
  const text = path.endsWith('.gz')
    ? gunzipSync(raw).toString('utf8')
    : raw.toString('utf8')
  const catalog = JSON.parse(text)
  // The extras file adds what the scrape cannot see; a scraped record wins.
  if (extrasPath && existsSync(extrasPath)) {
    const known = new Set(catalog.resources.map((r) => catalogKey(r.uri)))
    const extras = JSON.parse(readFileSync(extrasPath, 'utf8')).resources
    for (const r of extras) {
      if (!known.has(catalogKey(r.uri))) catalog.resources.push(r)
    }
    catalog.count = catalog.resources.length
  }
  cached = catalog
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
 * Split a reference into its beta marker and its `service/Resource` part.
 * Leading slashes, `api/v1/`, `beta/`, a division code or `{division}` go.
 * @param {string} ref
 * @returns {{beta: boolean, rest: string}}
 */
function splitRef(ref) {
  const match = String(ref)
    .replace(/^\/+/, '')
    .replace(/^api\/v1\//i, '')
    .match(/^(beta\/)?(?:(?:\d+|\{division\})\/)?(.*)$/is)
  return { beta: Boolean(match[1]), rest: match[2] }
}

/**
 * The reference to look up in the catalogue. With `--beta`, the beta record
 * comes first (`cashflow/AllocationRule` exists only there); a resource
 * without one keeps its regular record.
 * @param {string} ref
 * @param {boolean} beta
 * @param {object} [catalog]
 * @returns {string}
 */
export function betaRef(ref, beta, catalog = loadCatalog()) {
  if (!beta) return ref
  const { beta: isBeta, rest } = splitRef(ref)
  if (isBeta) return ref
  return findResource(`beta/${rest}`, catalog) ? `beta/${rest}` : ref
}

/**
 * Normalise any accepted reference to the lookup key of the catalogue:
 * lowercase, no /api/v1 prefix, the division replaced by `{division}`, no
 * key suffix, no query string.
 * @param {string} ref
 * @returns {string}
 */
export function catalogKey(ref) {
  const { beta, rest } = splitRef(
    String(ref)
      .trim()
      .split('?')[0]
      .replace(/\([^)]*\)$/, ''),
  )
  const s = rest.toLowerCase()
  if (s.startsWith('current/')) return s
  return `${beta ? 'beta/' : ''}{division}/${s}`
}

const indexOf = (catalog) =>
  catalog === cached ? cachedIndex : buildIndex(catalog)

/** All families a resource can come in, the regular one first. */
const FAMILIES = ['regular', 'sync', 'bulk', 'read']

/**
 * `service/Resource` as a user types it, from a catalogue uri.
 * @param {{uri: string}} res
 * @returns {string}
 */
export function shortName(res) {
  return res.uri.replace(/^\/api\/v1\/(beta\/)?(\{division\}\/)?/, '')
}

/**
 * The record of another family of the same resource (`bulk/CRM/Accounts`
 * for `crm/Accounts`), or undefined.
 * @param {object} resource a regular record
 * @param {'sync'|'bulk'|'read'} family
 * @param {object} [catalog]
 * @returns {object | undefined}
 */
export function variantOf(resource, family, catalog = loadCatalog()) {
  const target = catalogKey(resource.uri).replace(
    '{division}/',
    `{division}/${family}/`,
  )
  const direct = indexOf(catalog).get(target)
  if (direct) return direct
  // The accounting feeds live under Financial (sync/Financial/SalesEntries
  // for salesentry/SalesEntries): there, a unique resource name is the
  // variant. Elsewhere a name clash is another resource: sync/Payroll/
  // BankAccounts is not crm/BankAccounts. The scrape names a feed
  // 'CRM/Accounts': compare the last segment only.
  const last = (r) => r.resource.split('/').pop().toLowerCase()
  const name = last(resource)
  const byName = catalog.resources.filter(
    (r) =>
      r.family === family &&
      shortName(r).split('/')[1].toLowerCase() === 'financial' &&
      last(r) === name,
  )
  return byName.length === 1 ? byName[0] : undefined
}

/**
 * The names of the properties a reader can ask for: no hidden, no navigation.
 * @param {object} res
 * @returns {string[]}
 */
export const propertyNames = (res) => visible(res).map((p) => p.name)

/**
 * The families a regular resource exists in.
 * @param {object} resource
 * @param {object} [catalog]
 * @returns {string[]}
 */
export function familiesOf(resource, catalog = loadCatalog()) {
  return FAMILIES.filter(
    (family) => family === 'regular' || variantOf(resource, family, catalog),
  )
}

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
        a.r.resource.length - b.r.resource.length ||
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

/** The key kinds a record path renders differently. */
const KEY_TYPES = new Map([
  [GUID_TYPE, 'guid'],
  ['Edm.String', 'string'],
])

/** @param {object} res @returns {'guid' | 'string' | 'plain'} */
export const keyType = (res) =>
  KEY_TYPES.get(res.properties.find((p) => p.key)?.type) ?? 'plain'

/**
 * The columns a table shows by default: keys, then the names a reader looks
 * for, then the known dates (or the first date when none is known), then
 * amounts, then the rest, eight at most.
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
  const dates = props.filter((p) => p.type === DATE_TYPE).map((p) => p.name)
  const knownDates = DATE_ORDER.filter((d) => dates.includes(d))
  ;(knownDates.length ? knownDates : dates.slice(0, 1)).forEach(take)
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
  const resource = findResource(betaRef(ref, beta, catalog), catalog)
  const { beta: isBeta, rest } = splitRef(ref)
  if (/^current\//i.test(rest)) return { path: `/api/v1/${rest}`, resource }
  if (!rest.includes('/')) {
    throw new CliError('Resource must look like service/Resource', {
      exitCode: 64,
    })
  }
  return {
    path: divisionPath(division, rest, { beta: beta || isBeta }),
    resource,
  }
}

/**
 * Tell the user on stderr that a path is not in the catalogue. The request
 * still goes out: Exact adds resources before the documentation follows.
 * @param {string} ref
 * @param {object | undefined} resource
 * @param {object} [catalog]
 */
export function warnUnknown(ref, resource, catalog = loadCatalog()) {
  if (resource) return
  const date = catalog.generatedAt.slice(0, 10)
  process.stderr.write(
    `Unknown resource ${ref} (not in the catalogue of ${date}). Sending anyway.\n`,
  )
}

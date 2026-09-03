// Builds src/data/catalog.json.gz from the exactdoc scrape.
// Run: npm run catalog:build  (EXACTDOC_OUTPUT overrides ../exactdoc/output)
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'

const SOURCE_DIR = resolve(process.env.EXACTDOC_OUTPUT ?? '../exactdoc/output')
const SOURCE = resolve(SOURCE_DIR, 'data/resources.json')
const TARGET = resolve('src/data/catalog.json.gz')
const PROPERTY_KEYS = [
  'name',
  'type',
  'key',
  'mandatory',
  'filter',
  'post',
  'put',
  'navigation',
  'hidden',
  'description',
]
const NULL_DEFAULT = new Set(['filter', 'description'])

/** @param {string} uri @returns {string} */
export function familyOf(uri) {
  if (uri.startsWith('/api/v1/current/')) return 'current'
  if (uri.startsWith('/api/v1/beta/')) return 'beta'
  if (uri.includes('/{division}/sync/')) return 'sync'
  if (uri.includes('/{division}/bulk/')) return 'bulk'
  if (uri.includes('/{division}/read/')) return 'read'
  return 'regular'
}

/** Keep the fields the CLI reads; drop the prose the reference page carries. */
export function trimResource(r) {
  return {
    uri: r.uri,
    service: r.service,
    resource: r.resource,
    family: familyOf(r.uri),
    methods: r.methods ?? [],
    keys: r.keys ?? [],
    scope: r.scopeCode ?? null,
    webhook: Boolean(r.webhook),
    mandatoryFilters: r.mandatoryFilters ?? null,
    properties: (r.properties ?? []).map((p) =>
      Object.fromEntries(
        PROPERTY_KEYS.map((k) => [
          k,
          p[k] ?? (NULL_DEFAULT.has(k) ? null : false),
        ]),
      ),
    ),
  }
}

export function buildCatalog(scrape) {
  const resources = scrape.resources
    .map(trimResource)
    // Code point order: locale collation moves `{division}` before letters.
    .sort((a, b) => (a.uri < b.uri ? -1 : 1))
  return {
    generatedAt: scrape.generatedAt,
    source: scrape.source ?? 'exactdoc',
    count: resources.length,
    resources,
  }
}

export function diffCatalogs(before, after) {
  const index = (c) => new Map(c.resources.map((r) => [r.uri, r]))
  const a = index(before)
  const b = index(after)
  const added = [...b.keys()].filter((u) => !a.has(u))
  const removed = [...a.keys()].filter((u) => !b.has(u))
  const changed = [...b.keys()].filter(
    (u) =>
      a.has(u) &&
      JSON.stringify(a.get(u).properties) !==
        JSON.stringify(b.get(u).properties),
  )
  return { added, removed, changed }
}

export function main() {
  const scrape = JSON.parse(readFileSync(SOURCE, 'utf8'))
  const next = buildCatalog(scrape)
  if (existsSync(TARGET)) {
    const previous = JSON.parse(
      gunzipSync(readFileSync(TARGET)).toString('utf8'),
    )
    const { added, removed, changed } = diffCatalogs(previous, next)
    console.log(
      `added ${added.length}, removed ${removed.length}, changed ${changed.length}`,
    )
    for (const u of added) console.log(`  + ${u}`)
    for (const u of removed) console.log(`  - ${u}`)
    for (const u of changed) console.log(`  ~ ${u}`)
  }
  writeFileSync(TARGET, gzipSync(Buffer.from(JSON.stringify(next))))
  console.log(
    `wrote ${TARGET}: ${next.count} resources, generated ${next.generatedAt}`,
  )
}

if (process.argv[1] && basename(process.argv[1]) === 'build-catalog.mjs') main()

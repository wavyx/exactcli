// Generates the Homebrew formula for a version that is already on npm:
//
//   node scripts/gen-dist.mjs <version>
//
// Writes packaging/homebrew/exactcli.rb (git-ignored: the formula lives in
// the wavyx/homebrew-tap repository). The release workflow runs it after the
// npm publish, then scripts/publish-tap.sh pushes the file.
import { writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'

const PKG = '@wavyx/exactcli'

/**
 * The Homebrew formula: the standard pattern for a Node CLI.
 * @param {{ url: string, sha256: string }} dist
 * @returns {string}
 */
export function renderHomebrewFormula({ url, sha256 }) {
  return `class Exactcli < Formula
  desc "Command-line interface for Exact Online"
  homepage "https://wavyx.github.io/exactcli/"
  url "${url}"
  sha256 "${sha256}"
  license "MIT"

  depends_on "jq"
  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    # --jq uses node-jq, which downloads its own jq in a postinstall script.
    # std_npm_args ignores scripts and the build sandbox has no network, so
    # point node-jq at the Homebrew jq (node-jq reads JQ_PATH at runtime).
    (bin/"exactcli").write_env_script libexec/"bin/exactcli",
                                      JQ_PATH: formula_opt_bin("jq")/"jq"
  end

  test do
    assert_match "exactcli", shell_output("#{bin}/exactcli version")
    # Run --jq too, so the Homebrew jq wiring cannot break unnoticed.
    system bin/"exactcli", "config", "list", "--output", "json", "--jq", "."
  end
end
`
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * GET a URL and fail with a clear message on a non-2xx answer.
 * @param {typeof fetch} fetchFn
 * @param {string} url
 */
async function get(fetchFn, url) {
  const res = await fetchFn(url)
  if (!res.ok) throw new Error(`GET ${url} answered ${res.status}`)
  return res
}

/**
 * The tarball URL and its sha256 for a published version. The tarball must
 * match the sha512 integrity that the registry gives for it. A fresh publish
 * can answer 404 for a few minutes, so the metadata is fetched again until
 * the last attempt.
 * @param {string} version
 * @param {typeof fetch} [fetchFn]
 * @param {{ attempts?: number, delayMs?: number, sleep?: (ms: number) => Promise<void> }} [options]
 * @returns {Promise<{ version: string, url: string, sha256: string }>}
 */
export async function fetchDist(
  version,
  fetchFn = fetch,
  { attempts = 20, delayMs = 30_000, sleep = defaultSleep } = {},
) {
  const metaUrl = `https://registry.npmjs.org/${PKG}/${version}`
  let meta
  for (let attempt = 1; ; attempt++) {
    try {
      meta = await (await get(fetchFn, metaUrl)).json()
      break
    } catch (error) {
      if (attempt >= attempts) throw error
      await sleep(delayMs)
    }
  }
  const { tarball: url, integrity } = meta.dist
  const buf = Buffer.from(await (await get(fetchFn, url)).arrayBuffer())
  const sri = 'sha512-' + createHash('sha512').update(buf).digest('base64')
  if (sri !== integrity) {
    throw new Error(`${url} does not match the registry integrity`)
  }
  const sha256 = createHash('sha256').update(buf).digest('hex')
  return { version, url, sha256 }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const version = process.argv[2]
  if (!version) {
    console.error('usage: node scripts/gen-dist.mjs <version>')
    process.exit(1)
  }
  const dist = await fetchDist(version)
  mkdirSync(new URL('../packaging/homebrew/', import.meta.url), {
    recursive: true,
  })
  writeFileSync(
    new URL('../packaging/homebrew/exactcli.rb', import.meta.url),
    renderHomebrewFormula(dist),
  )
  console.log(
    `Wrote packaging/homebrew/exactcli.rb for ${version} (sha256 ${dist.sha256})`,
  )
}

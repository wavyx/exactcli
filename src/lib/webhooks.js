import { createHmac, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'

/** A notification is small; anything larger is not from Exact. */
const MAX_BODY = 64 * 1024
const HEX_RE = /^[0-9a-f]+$/i

/**
 * The raw text of the Content node of a notification. Exact signs these exact
 * bytes, so a re-serialised object would not match: scan the braces, and
 * skip the ones inside strings.
 * @param {string} raw the request body
 * @returns {string | null}
 */
export function contentOf(raw) {
  const match = /"Content"\s*:\s*\{/.exec(raw)
  if (!match) return null
  const start = match.index + match[0].length - 1
  let depth = 0
  let inString = false
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i]
    if (inString) {
      if (ch === '\\') i++
      else if (ch === '"') inString = false
    } else if (ch === '"') {
      inString = true
    } else if (ch === '{') {
      depth++
    } else if (ch === '}' && --depth === 0) {
      return raw.slice(start, i + 1)
    }
  }
  return null
}

/**
 * The Content of a notification when it carries the HMAC-SHA256 of its
 * Content text, keyed with the webhook secret of the app; null otherwise.
 * The signed text must be the top-level Content itself: a body with a second
 * Content key, or a signed Content nested deeper, must not pass a forged one
 * through. The comparison runs in constant time.
 * @param {string} raw the request body
 * @param {string} secret
 * @returns {object | null}
 */
export function verifiedContent(raw, secret) {
  const content = contentOf(raw)
  let body
  let signed
  try {
    body = JSON.parse(raw)
    signed = content === null ? null : JSON.parse(content)
  } catch {
    return null
  }
  const hash = body?.HashCode
  if (signed === null || typeof hash !== 'string' || !HEX_RE.test(hash)) {
    return null
  }
  if (JSON.stringify(signed) !== JSON.stringify(body.Content)) return null
  const expected = createHmac('sha256', secret).update(content).digest()
  const given = Buffer.from(hash, 'hex')
  const valid =
    given.length === expected.length && timingSafeEqual(given, expected)
  return valid ? signed : null
}

/**
 * Whether a notification is signed: see verifiedContent.
 * @param {string} raw the request body
 * @param {string} secret
 * @returns {boolean}
 */
export const verifySignature = (raw, secret) =>
  verifiedContent(raw, secret) !== null

/**
 * A loopback server for Exact notifications on one path. An empty POST is the
 * validation call of a new subscription and gets 200. A signed notification
 * goes to onEvent and gets 200, so Exact does not send it again; an unsigned
 * one goes to onInvalid and gets 401.
 * @param {object} options
 * @param {number} options.port 0 picks a free port
 * @param {string} options.path
 * @param {string} options.secret the webhook secret of the app
 * @param {(content: object) => void} options.onEvent
 * @param {(reason: string) => void} options.onInvalid
 * @returns {Promise<{ port: number, close: () => Promise<void> }>}
 */
export function startWebhookServer({ port, path, secret, onEvent, onInvalid }) {
  const server = createServer((req, res) => {
    const answer = (status) => {
      res.writeHead(status, { 'content-type': 'text/plain' })
      res.end()
    }
    if (new URL(req.url, 'http://localhost').pathname !== path)
      return answer(404)
    if (req.method !== 'POST') return answer(405)

    const chunks = []
    let size = 0
    let tooLarge = false
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) tooLarge = true
      else chunks.push(chunk)
    })
    req.on('end', () => {
      if (tooLarge) return answer(413)
      const raw = Buffer.concat(chunks).toString('utf8')
      if (raw.trim() === '') return answer(200)
      const content = verifiedContent(raw, secret)
      if (content === null) {
        onInvalid('bad signature')
        return answer(401)
      }
      onEvent(content)
      answer(200)
    })
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        close: () => new Promise((done) => server.close(() => done())),
      })
    })
  })
}

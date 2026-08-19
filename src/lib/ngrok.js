import { spawn as defaultSpawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import createDebug from 'debug'
import { ConfigError, ServiceUnavailableError } from './errors.js'

const debug = createDebug('exact:ngrok')

/**
 * Start an ngrok tunnel that forwards a reserved domain to a local port.
 * Exact Online only accepts an HTTPS redirect URI, so the OAuth callback
 * needs a public name in front of the loopback server.
 *
 * @param {object} options
 * @param {string} options.domain reserved ngrok domain, without the scheme
 * @param {number} options.port local port that receives the callback
 * @param {string} [options.bin] ngrok executable
 * @param {typeof defaultSpawn} [options.spawn] injected for tests
 * @param {number} [options.timeoutMs] time to wait for the tunnel
 * @returns {Promise<{ url: string, stop: () => void }>}
 */
export function startTunnel({
  domain,
  port,
  bin = 'ngrok',
  spawn = defaultSpawn,
  timeoutMs = 15_000,
}) {
  const url = `https://${domain}`
  const args = [
    'http',
    String(port),
    `--url=${url}`,
    '--inspect=false',
    '--log=stdout',
    '--log-format=json',
  ]
  debug('spawn %s %s', bin, args.join(' '))
  const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  // Drain stderr: a piped stream that nobody reads fills up and blocks ngrok,
  // and the tunnel has to survive the whole login.
  child.stderr?.on('data', (chunk) => debug('stderr: %s', String(chunk).trim()))

  return new Promise((resolve, reject) => {
    let settled = false

    /** @param {() => void} outcome */
    const settle = (outcome) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      outcome()
    }

    const timer = setTimeout(() => {
      settle(() => {
        child.kill('SIGTERM')
        reject(
          new ServiceUnavailableError(
            `ngrok did not report a tunnel within ${Math.round(timeoutMs / 1000)}s. Use --manual`,
          ),
        )
      })
    }, timeoutMs)

    // Keep reading stdout after the tunnel is up: ngrok keeps logging, and an
    // unread pipe fills up and blocks the process.
    createInterface({ input: child.stdout }).on('line', (text) => {
      let entry
      try {
        entry = JSON.parse(text)
      } catch {
        return // ngrok also writes plain banner lines
      }
      if (entry.msg === 'started tunnel') {
        debug('tunnel ready at %s', url)
        settle(() => resolve({ url, stop: () => child.kill('SIGTERM') }))
      }
    })

    child.on('error', () => {
      settle(() =>
        reject(
          new ConfigError(
            'ngrok not found on PATH. Install ngrok or use --manual',
          ),
        ),
      )
    })

    child.on('exit', (code) => {
      settle(() =>
        reject(
          new ServiceUnavailableError(
            `ngrok exited (code ${code}) before the tunnel was ready. Is the domain in use? Use --manual`,
          ),
        ),
      )
    })
  })
}

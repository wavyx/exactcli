import { describe, it, expect, afterEach, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { startTunnel } from '../../src/lib/ngrok.js'
import { ConfigError, ServiceUnavailableError } from '../../src/lib/errors.js'

const DOMAIN = 'acme.ngrok.app'
const URL = `https://${DOMAIN}`
const PORT = 9999

/** A child process double: EventEmitter plus piped stdio and a kill spy. */
function fakeChild() {
  const child = new EventEmitter()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.kill = vi.fn()
  return child
}

function line(entry) {
  return `${JSON.stringify(entry)}\n`
}

const READY = line({ lvl: 'info', msg: 'started tunnel', url: URL })

/** Let the readline interface deliver the lines written so far. */
function flush() {
  return new Promise((resolve) => setImmediate(resolve))
}

afterEach(() => {
  vi.useRealTimers()
})

describe('startTunnel', () => {
  it('spawns ngrok with the documented arguments', async () => {
    const child = fakeChild()
    const spawn = vi.fn(() => child)

    const promise = startTunnel({ domain: DOMAIN, port: PORT, spawn })

    expect(spawn).toHaveBeenCalledWith(
      'ngrok',
      [
        'http',
        '9999',
        `--url=${URL}`,
        '--inspect=false',
        '--log=stdout',
        '--log-format=json',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    child.stdout.write(READY)
    await expect(promise).resolves.toMatchObject({ url: URL })
  })

  it('ignores non-JSON lines and other log messages', async () => {
    const child = fakeChild()
    const promise = startTunnel({
      domain: DOMAIN,
      port: PORT,
      spawn: () => child,
      timeoutMs: 5_000,
    })

    child.stdout.write('ngrok banner, not JSON\n')
    child.stdout.write(line({ msg: 'starting web service' }))
    await flush()
    child.stdout.write(READY)

    const tunnel = await promise
    expect(tunnel.url).toBe(URL)
  })

  it('stops the tunnel with SIGTERM and tolerates a repeated stop', async () => {
    const child = fakeChild()
    const promise = startTunnel({
      domain: DOMAIN,
      port: PORT,
      spawn: () => child,
    })
    child.stdout.write(READY)
    const { stop } = await promise

    stop()
    stop()

    expect(child.kill).toHaveBeenCalledTimes(2)
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
  })

  it('stays resolved when ngrok exits after the tunnel is ready', async () => {
    const child = fakeChild()
    const promise = startTunnel({
      domain: DOMAIN,
      port: PORT,
      spawn: () => child,
    })
    child.stdout.write(READY)
    const tunnel = await promise

    child.emit('exit', 0)
    child.stdout.write(READY)
    await flush()

    expect(tunnel.url).toBe(URL)
  })

  it('rejects when the binary is not on PATH', async () => {
    // No spawn injected: this exercises the real child_process.spawn and the
    // ENOENT it reports for a binary that does not exist.
    const err = await startTunnel({
      domain: DOMAIN,
      port: PORT,
      bin: 'exactcli-no-such-ngrok-binary',
    }).catch((e) => e)

    expect(err).toBeInstanceOf(ConfigError)
    expect(err.exitCode).toBe(78)
    expect(err.message).toBe(
      'ngrok not found on PATH. Install ngrok or use --manual',
    )
  })

  it('rejects when ngrok exits before the tunnel is ready', async () => {
    const child = fakeChild()
    const promise = startTunnel({
      domain: DOMAIN,
      port: PORT,
      spawn: () => child,
    })

    child.emit('exit', 1)

    const err = await promise.catch((e) => e)
    expect(err).toBeInstanceOf(ServiceUnavailableError)
    expect(err.exitCode).toBe(69)
    expect(err.message).toBe(
      'ngrok exited (code 1) before the tunnel was ready. Is the domain in use? Use --manual',
    )
  })

  it('kills ngrok and rejects when no tunnel is reported in time', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const child = fakeChild()
    const promise = startTunnel({
      domain: DOMAIN,
      port: PORT,
      spawn: () => child,
    }).catch((e) => e)

    await vi.advanceTimersByTimeAsync(15_000)

    const err = await promise
    expect(err).toBeInstanceOf(ServiceUnavailableError)
    expect(err.exitCode).toBe(69)
    expect(err.message).toBe(
      'ngrok did not report a tunnel within 15s. Use --manual',
    )
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
  })

  it('reports the configured timeout in the message', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const child = fakeChild()
    const promise = startTunnel({
      domain: DOMAIN,
      port: PORT,
      spawn: () => child,
      timeoutMs: 2_000,
    }).catch((e) => e)

    await vi.advanceTimersByTimeAsync(2_000)

    expect((await promise).message).toBe(
      'ngrok did not report a tunnel within 2s. Use --manual',
    )
  })

  it('drains stderr before and after the tunnel is ready', async () => {
    const child = fakeChild()
    const promise = startTunnel({
      domain: DOMAIN,
      port: PORT,
      spawn: () => child,
    })

    // A listener puts the stream in flowing mode: an unread pipe fills up and
    // blocks ngrok, and ngrok has to survive the whole login.
    expect(child.stderr.readableFlowing).toBe(true)
    child.stderr.write('WARN something before ready\n')
    child.stdout.write(READY)
    const tunnel = await promise
    child.stderr.write('WARN something after ready\n')
    await flush()

    expect(tunnel.url).toBe(URL)
    tunnel.stop()
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
  })

  it('tolerates a child without a stderr pipe', async () => {
    const child = fakeChild()
    child.stderr = null
    const promise = startTunnel({
      domain: DOMAIN,
      port: PORT,
      spawn: () => child,
    })

    child.stdout.write(READY)

    await expect(promise).resolves.toMatchObject({ url: URL })
  })
})

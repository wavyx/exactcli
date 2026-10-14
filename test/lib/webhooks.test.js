import { describe, it, expect, vi, afterEach } from 'vitest'
import { createHmac } from 'node:crypto'
import { request } from 'node:http'
import {
  contentOf,
  startWebhookServer,
  verifySignature,
} from '../../src/lib/webhooks.js'

const SECRET = 'test-secret'
const CONTENT =
  '{"Topic":"Accounts","Action":"Update","Division":123,"Key":"k","ExactOnlineEndpoint":"https://x/api/v1/123/crm/Accounts(guid\'k\')","EventCreatedOn":"2026-09-25T10:00:00.000"}'
const sign = (text, secret = SECRET) =>
  createHmac('sha256', secret).update(text).digest('hex').toUpperCase()
const body = (content = CONTENT, hash = sign(content)) =>
  `{"Content":${content},"HashCode":"${hash}"}`

describe('contentOf', () => {
  it('returns the raw text of the Content node, braces and strings included', () => {
    const tricky = '{"a":"} \\" {","b":{"c":[1,{"d":2}]}}'
    expect(contentOf(body())).toBe(CONTENT)
    expect(contentOf(`{ "Content" : ${tricky} , "HashCode":"x"}`)).toBe(tricky)
  })

  it('returns null without a Content object', () => {
    expect(contentOf('{"HashCode":"x"}')).toBeNull()
    expect(contentOf('{"Content":"text"}')).toBeNull()
    expect(contentOf('{"Content":{"a":1')).toBeNull()
  })
})

describe('verifySignature', () => {
  it('accepts the HMAC-SHA256 of the Content text, in any case', () => {
    expect(verifySignature(body(), SECRET)).toBe(true)
    expect(
      verifySignature(body(CONTENT, sign(CONTENT).toLowerCase()), SECRET),
    ).toBe(true)
  })

  it('refuses a body without a Content object', () => {
    expect(verifySignature('{"HashCode":"AB"}', SECRET)).toBe(false)
  })

  it('refuses a forged top-level Content beside or around a signed one', () => {
    const forged = CONTENT.replace('Update', 'Delete')
    const hash = sign(CONTENT)
    // A second Content key: JSON keeps the last one, the scan finds the first.
    expect(
      verifySignature(
        `{"Content":${CONTENT},"Content":${forged},"HashCode":"${hash}"}`,
        SECRET,
      ),
    ).toBe(false)
    // A signed Content nested before the top-level one.
    expect(
      verifySignature(
        `{"Meta":{"Content":${CONTENT}},"Content":${forged},"HashCode":"${hash}"}`,
        SECRET,
      ),
    ).toBe(false)
  })

  it('refuses a changed content, another secret, a missing or broken hash', () => {
    const changed = body(CONTENT.replace('Update', 'Delete'), sign(CONTENT))
    expect(verifySignature(changed, SECRET)).toBe(false)
    expect(verifySignature(body(CONTENT, sign(CONTENT, 'other')), SECRET)).toBe(
      false,
    )
    expect(verifySignature(`{"Content":${CONTENT}}`, SECRET)).toBe(false)
    expect(verifySignature(body(CONTENT, 'zz'), SECRET)).toBe(false)
    expect(verifySignature('not json', SECRET)).toBe(false)
  })
})

describe('startWebhookServer', () => {
  let server
  afterEach(async () => {
    await server?.close()
    server = undefined
  })

  /** One request to the server, answered with its status code. */
  function send(port, { method = 'POST', path = '/callback', data = '' } = {}) {
    return new Promise((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port, method, path }, (res) => {
        res.resume()
        res.on('end', () => resolve(res.statusCode))
      })
      req.on('error', reject)
      req.end(data)
    })
  }

  it('answers the empty validation POST, passes a signed event, refuses the rest', async () => {
    const onEvent = vi.fn()
    const onInvalid = vi.fn()
    server = await startWebhookServer({
      port: 0,
      path: '/callback',
      secret: SECRET,
      onEvent,
      onInvalid,
    })

    expect(await send(server.port)).toBe(200)
    expect(await send(server.port, { data: body() })).toBe(200)
    expect(
      await send(server.port, { data: body(CONTENT, sign(CONTENT, 'x')) }),
    ).toBe(401)
    expect(await send(server.port, { data: 'not json' })).toBe(401)
    expect(await send(server.port, { method: 'GET' })).toBe(405)
    expect(await send(server.port, { path: '/other' })).toBe(404)
    expect(await send(server.port, { data: 'x'.repeat(70_000) })).toBe(413)

    expect(onEvent).toHaveBeenCalledTimes(1)
    expect(onEvent).toHaveBeenCalledWith(JSON.parse(CONTENT))
    expect(onInvalid).toHaveBeenCalledTimes(2)
    expect(onInvalid).toHaveBeenCalledWith('bad signature')
  })
})

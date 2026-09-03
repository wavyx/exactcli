import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  CliError,
  AuthRequiredError,
  ConfigError,
  RateLimitError,
  ServiceUnavailableError,
  ApiError,
  handleError,
} from '../../src/lib/errors.js'

describe('CliError', () => {
  it('sets message and default exitCode', () => {
    const err = new CliError('something broke')
    expect(err.message).toBe('something broke')
    expect(err.exitCode).toBe(1)
    expect(err).toBeInstanceOf(Error)
  })

  it('accepts a custom exitCode', () => {
    const err = new CliError('custom', { exitCode: 42 })
    expect(err.exitCode).toBe(42)
  })

  it('accepts a cause option', () => {
    const cause = new Error('root cause')
    const err = new CliError('wrapper', { cause })
    expect(err.cause).toBe(cause)
  })
})

describe('AuthRequiredError', () => {
  it('has exitCode 77 and correct message', () => {
    const err = new AuthRequiredError()
    expect(err.exitCode).toBe(77)
    expect(err.message).toBe('Not authenticated. Run: exactcli auth login')
    expect(err).toBeInstanceOf(CliError)
  })
})

describe('ConfigError', () => {
  it('has exitCode 78 and preserves message', () => {
    const err = new ConfigError('bad config')
    expect(err.exitCode).toBe(78)
    expect(err.message).toBe('bad config')
    expect(err).toBeInstanceOf(CliError)
  })
})

describe('RateLimitError', () => {
  it('has exitCode 75 and stores retryAfter', () => {
    const err = new RateLimitError(30)
    expect(err.exitCode).toBe(75)
    expect(err.retryAfter).toBe(30)
    expect(err.message).toBe('Rate limited. Retry after 30s')
    expect(err).toBeInstanceOf(CliError)
  })
})

describe('ServiceUnavailableError', () => {
  it('has exitCode 69 and a default message', () => {
    const err = new ServiceUnavailableError()
    expect(err.exitCode).toBe(69)
    expect(err.message).toBe('Exact Online API is unavailable')
    expect(err).toBeInstanceOf(CliError)
  })

  it('accepts a custom message and a cause', () => {
    const cause = new Error('ECONNRESET')
    const err = new ServiceUnavailableError('network down', { cause })
    expect(err.message).toBe('network down')
    expect(err.cause).toBe(cause)
    expect(err.exitCode).toBe(69)
  })
})

describe('ApiError', () => {
  it('extracts the message from the OData error envelope', () => {
    const body = {
      error: { code: 'x', message: { lang: '', value: 'Bad filter' } },
    }
    const err = new ApiError(400, body, '/api/v1/123/crm/Accounts')
    expect(err.message).toBe('Exact Online API 400: Bad filter')
    expect(err.statusCode).toBe(400)
    expect(err.path).toBe('/api/v1/123/crm/Accounts')
    expect(err.body).toEqual(body)
  })

  it('falls back to error_description (OAuth token endpoint)', () => {
    const body = { error: 'invalid_grant', error_description: 'Token expired' }
    const err = new ApiError(400, body, '/api/oauth2/token')
    expect(err.message).toBe('Exact Online API 400: Token expired')
  })

  it('falls back to a string error field', () => {
    const err = new ApiError(401, { error: 'unauthorized_client' }, '/x')
    expect(err.message).toBe('Exact Online API 401: unauthorized_client')
  })

  it('falls back to the message field', () => {
    const err = new ApiError(502, { message: 'Bad Gateway' }, '/x')
    expect(err.message).toBe('Exact Online API 502: Bad Gateway')
  })

  it('falls back to a generic message when the body is empty', () => {
    const err = new ApiError(500, {}, '/x')
    expect(err.message).toBe('Exact Online API 500: API error 500')
  })

  it('falls back to a generic message when the body is absent', () => {
    const err = new ApiError(500, undefined, '/x')
    expect(err.message).toBe('Exact Online API 500: API error 500')
  })

  it('maps 400 to exitCode 65 (data)', () => {
    expect(new ApiError(400, {}, '/x').exitCode).toBe(65)
  })

  it('maps 422 to exitCode 65 (data)', () => {
    expect(new ApiError(422, {}, '/x').exitCode).toBe(65)
  })

  it('maps 401 to exitCode 77 (auth)', () => {
    expect(new ApiError(401, {}, '/x').exitCode).toBe(77)
  })

  it('maps 403 to exitCode 77 (permission)', () => {
    expect(new ApiError(403, {}, '/x').exitCode).toBe(77)
  })

  it('maps 402 to exitCode 78 (config)', () => {
    expect(new ApiError(402, {}, '/x').exitCode).toBe(78)
  })

  it('maps 429 to exitCode 75 (rate limited)', () => {
    expect(new ApiError(429, {}, '/x').exitCode).toBe(75)
  })

  it('maps 5xx to exitCode 69', () => {
    expect(new ApiError(503, {}, '/x').exitCode).toBe(69)
  })

  it('defaults exitCode to 1 for other status codes', () => {
    expect(new ApiError(404, {}, '/x').exitCode).toBe(1)
    expect(new ApiError(410, {}, '/x').exitCode).toBe(1)
  })

  it('adds a hint on 403 WrongDivision', () => {
    const err = new ApiError(
      403,
      { message: 'Forbidden - WrongDivision' },
      '/x',
    )
    expect(err.exitCode).toBe(77)
    expect(err.message).toBe(
      'Exact Online API 403: Forbidden - WrongDivision. Run: exactcli config set division <code> (see exactcli me)',
    )
  })

  describe('.fromResponse', () => {
    it('parses a JSON body and creates an ApiError', () => {
      const text = JSON.stringify({
        error: { code: 'x', message: { lang: 'en', value: 'not found' } },
      })
      const err = ApiError.fromResponse(404, text, '/api/v1/123/crm/Accounts')
      expect(err).toBeInstanceOf(ApiError)
      expect(err.statusCode).toBe(404)
      expect(err.message).toBe('Exact Online API 404: not found')
    })

    it('handles a non-JSON text body gracefully', () => {
      const err = ApiError.fromResponse(502, 'Bad Gateway', '/x')
      expect(err).toBeInstanceOf(ApiError)
      expect(err.statusCode).toBe(502)
      expect(err.body).toEqual({ message: 'Bad Gateway' })
      expect(err.message).toBe('Exact Online API 502: Bad Gateway')
    })

    it('trims a padded text body', () => {
      const text = `Status Code: 404; Not Found${' '.repeat(300)}`
      const err = ApiError.fromResponse(404, text, '/x')
      expect(err.message).toBe(
        'Exact Online API 404: Status Code: 404; Not Found',
      )
    })

    it('truncates huge non-JSON bodies (e.g. HTML error pages)', () => {
      const html = `<!DOCTYPE html><html>${'x'.repeat(20_000)}</html>`
      const err = ApiError.fromResponse(404, html, '/api/v1/missing')
      expect(err.message.length).toBeLessThan(400)
      expect(err.message).toContain('...')
    })

    it('maps status codes to the correct exit codes', () => {
      expect(ApiError.fromResponse(422, '{}', '/x').exitCode).toBe(65)
      expect(ApiError.fromResponse(403, '{}', '/x').exitCode).toBe(77)
      expect(ApiError.fromResponse(429, '{}', '/x').exitCode).toBe(75)
      expect(ApiError.fromResponse(500, '{}', '/x').exitCode).toBe(69)
    })
  })
})

describe('handleError', () => {
  let stderrSpy

  afterEach(() => {
    if (stderrSpy) stderrSpy.mockRestore()
  })

  /** A command double whose exit() throws, so the JSON path is observable. */
  function jsonCmd(flags, extra = {}) {
    return {
      flags,
      error: vi.fn(),
      exit: vi.fn((code) => {
        throw new Error(`exit ${code}`)
      }),
      ...extra,
    }
  }

  it('delegates to cmd.error with err.message and exitCode for a plain CliError', () => {
    const cmd = { flags: {}, error: vi.fn(), exit: vi.fn() }
    const err = new CliError('something broke', { exitCode: 5 })

    handleError(err, cmd)

    expect(cmd.error).toHaveBeenCalledWith('something broke', { exit: 5 })
  })

  it('defaults to exit code 70 when err has no exitCode', () => {
    const cmd = { flags: {}, error: vi.fn(), exit: vi.fn() }

    handleError(new Error('unknown'), cmd)

    expect(cmd.error).toHaveBeenCalledWith('unknown', { exit: 70 })
  })

  it('maps an oclif parse failure to exit code 64 (usage)', () => {
    const cmd = { flags: {}, error: vi.fn(), exit: vi.fn() }
    const err = new Error('Unexpected argument')
    err.oclif = { exit: 2 }

    handleError(err, cmd)

    expect(cmd.error).toHaveBeenCalledWith('Unexpected argument', { exit: 64 })
  })

  it('writes JSON to stderr when --output json', () => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const cmd = jsonCmd({ output: 'json' })
    const err = new ApiError(
      404,
      { error: { code: 'x', message: { lang: '', value: 'Not found' } } },
      '/api/v1/123/crm/Accounts',
    )

    expect(() => handleError(err, cmd)).toThrow('exit 1')

    const parsed = JSON.parse(stderrSpy.mock.calls[0][0])
    expect(parsed.error).toBe('ApiError')
    expect(parsed.message).toBe('Exact Online API 404: Not found')
    expect(parsed.statusCode).toBe(404)
    expect(parsed.path).toBe('/api/v1/123/crm/Accounts')
    expect(parsed.exitCode).toBe(1)
    expect(parsed.body).toBeUndefined() // not included without --verbose
  })

  it('JSON error includes the body when --verbose', () => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const cmd = jsonCmd({ output: 'json', verbose: true })
    const body = { error: { code: 'x', message: { lang: '', value: 'Bad' } } }

    expect(() => handleError(new ApiError(422, body, '/x'), cmd)).toThrow(
      'exit 65',
    )

    const parsed = JSON.parse(stderrSpy.mock.calls[0][0])
    expect(parsed.body).toEqual(body)
  })

  it('JSON error for a non-ApiError omits statusCode, path, and body', () => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const cmd = jsonCmd({ output: 'json' })

    expect(() => handleError(new ConfigError('bad config'), cmd)).toThrow(
      'exit 78',
    )

    const parsed = JSON.parse(stderrSpy.mock.calls[0][0])
    expect(parsed.error).toBe('ConfigError')
    expect(parsed.message).toBe('bad config')
    expect(parsed.exitCode).toBe(78)
    expect(parsed.statusCode).toBeUndefined()
    expect(parsed.path).toBeUndefined()
    expect(parsed.body).toBeUndefined()
  })

  it('recovers --output=json from raw argv when parsing failed', () => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const cmd = jsonCmd(undefined, { argv: ['--output=json', '--bogus'] })
    const err = new Error('Nonexistent flag: --bogus')
    err.oclif = { exit: 2 }

    expect(() => handleError(err, cmd)).toThrow('exit 64')

    expect(JSON.parse(stderrSpy.mock.calls[0][0]).exitCode).toBe(64)
  })

  it('recovers -o json (separate value) from raw argv', () => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const cmd = jsonCmd({}, { argv: ['deal', '-o', 'json'] })

    expect(() => handleError(new ConfigError('bad'), cmd)).toThrow('exit 78')

    expect(JSON.parse(stderrSpy.mock.calls[0][0]).message).toBe('bad')
  })

  it('falls back to the stored default output when argv carries no --output', () => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const cmd = jsonCmd(
      {},
      {
        argv: ['list'],
        storedDefaultOutput: () => 'yaml',
      },
    )

    expect(() => handleError(new ConfigError('bad'), cmd)).toThrow('exit 78')

    expect(JSON.parse(stderrSpy.mock.calls[0][0]).message).toBe('bad')
  })

  it('emits JSON when stdout is piped and nothing else resolves the format', () => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    process.stdout.isTTY = false
    const cmd = jsonCmd({})

    expect(() => handleError(new ConfigError('bad'), cmd)).toThrow('exit 78')

    expect(JSON.parse(stderrSpy.mock.calls[0][0]).message).toBe('bad')
  })

  it('stays human-readable in a TTY when the stored default is table', () => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const cmd = {
      flags: {},
      argv: [],
      storedDefaultOutput: () => 'table',
      error: vi.fn(),
      exit: vi.fn(),
    }

    handleError(new ConfigError('bad'), cmd)

    expect(stderrSpy).not.toHaveBeenCalled()
    expect(cmd.error).toHaveBeenCalledWith('bad', { exit: 78 })
  })

  it('writes verbose request and response details to stderr for an ApiError', () => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const cmd = { flags: { verbose: true }, error: vi.fn(), exit: vi.fn() }
    const err = new ApiError(500, { message: 'oops' }, '/api/v1/things')

    handleError(err, cmd)

    const writes = stderrSpy.mock.calls.map((c) => c[0]).join('')
    expect(writes).toContain('Request path: /api/v1/things')
    expect(writes).toContain('Status code:  500')
    expect(writes).toContain('Response body:')
    expect(writes).toContain('"message": "oops"')
    expect(cmd.error).toHaveBeenCalledWith(err.message, { exit: 69 })
  })

  it('verbose ApiError with a falsy body omits the response body section', () => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const cmd = { flags: { verbose: true }, error: vi.fn(), exit: vi.fn() }
    const err = new ApiError(500, { message: 'x' }, '/x')
    err.body = null

    handleError(err, cmd)

    const writes = stderrSpy.mock.calls.map((c) => c[0]).join('')
    expect(writes).not.toContain('Response body:')
  })

  it('verbose flag has no effect on a non-ApiError', () => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const cmd = { flags: { verbose: true }, error: vi.fn(), exit: vi.fn() }

    handleError(new ConfigError('bad'), cmd)

    expect(stderrSpy).not.toHaveBeenCalled()
    expect(cmd.error).toHaveBeenCalledWith('bad', { exit: 78 })
  })

  it('handles a missing cmd.flags by defaulting to a plain error', () => {
    const cmd = { error: vi.fn(), exit: vi.fn() }
    const err = new CliError('oh no', { exitCode: 3 })

    handleError(err, cmd)

    expect(cmd.error).toHaveBeenCalledWith('oh no', { exit: 3 })
  })
})

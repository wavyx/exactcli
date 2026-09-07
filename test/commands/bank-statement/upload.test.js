import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from 'vitest'
import nock from 'nock'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mockApi, runCmd } from '../../helpers.js'

const TMP_CONFIG_DIR = mkdtempSync(
  join(tmpdir(), 'exactcli-bank-statement-upload-'),
)
const FILES_DIR = mkdtempSync(join(tmpdir(), 'exactcli-files-'))

const { default: Cmd } =
  await import('../../../src/commands/bank-statement/upload.js')

const DOC = '11111111-1111-1111-1111-111111111111'
const ATT = '22222222-2222-2222-2222-222222222222'
const DOCUMENTS = '/api/v1/123/documents/Documents'
const UPLOADS = '/api/v1/123/cashflow/BankStatementUploadAttachments'
const FILE = join(FILES_DIR, 'statement.cod')
const b64 = (bytes) => Buffer.from(bytes).toString('base64')

beforeAll(() => {
  process.env.EXACTCLI_CONFIG_DIR = TMP_CONFIG_DIR
  process.env.EXACTCLI_ACCESS_TOKEN = 'test-token'
  process.env.EXACTCLI_DIVISION = '123'
  writeFileSync(FILE, 'hello')
})

afterAll(() => {
  delete process.env.EXACTCLI_CONFIG_DIR
  delete process.env.EXACTCLI_ACCESS_TOKEN
  delete process.env.EXACTCLI_DIVISION
  rmSync(TMP_CONFIG_DIR, { recursive: true, force: true })
  rmSync(FILES_DIR, { recursive: true, force: true })
})

beforeEach(() => {
  nock.disableNetConnect()
  process.stdout.isTTY = false
})

afterEach(() => {
  nock.cleanAll()
  nock.enableNetConnect()
})

const fail = (argv) => {
  process.stdout.isTTY = true
  return Cmd.run(argv).catch((e) => e)
}
const exit = (err) => err.exitCode ?? err.oclif?.exit

/** Mock the two POSTs of a full run and record their bodies in order. */
function mockUpload(calls) {
  const record = (body) => {
    calls.push(body)
    return true
  }
  return mockApi()
    .post(DOCUMENTS, record)
    .reply(201, { d: { __metadata: { uri: 'x' }, ID: DOC, Type: 42 } })
    .post(UPLOADS, record)
    .reply(201, { d: { ID: ATT, FileSize: 5 } })
}

describe('bank-statement upload', () => {
  it('--dry-run prints the document request and the file size, never the bytes', async () => {
    const scope = mockApi().post(DOCUMENTS).reply(201, { d: {} })

    const text = await runCmd(Cmd, ['--file', FILE, '--dry-run'])

    expect(JSON.parse(text)).toEqual({
      method: 'POST',
      path: DOCUMENTS,
      body: { Subject: 'statement.cod', Type: 42 },
      fileName: 'statement.cod',
      size: 5,
    })
    expect(text).not.toContain(b64('hello'))
    expect(scope.isDone()).toBe(false)
  })

  it('refuses without --allow-writes and sends nothing', async () => {
    const scope = mockApi().post(DOCUMENTS).reply(201, { d: {} })

    const err = await fail(['--file', FILE])

    expect(exit(err)).toBe(77)
    expect(scope.isDone()).toBe(false)
  })

  it('POSTs the document, then the bank statement attachment', async () => {
    const calls = []
    const scope = mockUpload(calls)

    const out = JSON.parse(
      await runCmd(Cmd, [
        '--file',
        FILE,
        '--subject',
        'September statements',
        '--allow-writes',
      ]),
    )

    expect(scope.isDone()).toBe(true)
    expect(calls).toEqual([
      { Subject: 'September statements', Type: 42 },
      { Document: DOC, FileName: 'statement.cod', Attachment: b64('hello') },
    ])
    expect(out).toEqual({
      document: DOC,
      attachment: ATT,
      fileName: 'statement.cod',
      size: 5,
    })
  })

  it('prints a one-row table in a terminal', async () => {
    mockUpload([])
    process.stdout.isTTY = true

    const out = await runCmd(Cmd, ['--file', FILE, '--allow-writes'])

    expect(out).toMatch(/Document/)
    expect(out).toContain(DOC)
    expect(out).toMatch(/statement\.cod/)
  })

  it('fails with 65 on a missing file before any request', async () => {
    const scope = mockApi().post(DOCUMENTS).reply(201, { d: {} })
    const missing = join(FILES_DIR, 'missing.cod')

    const err = await fail(['--file', missing, '--allow-writes'])

    expect(exit(err)).toBe(65)
    expect(err.message).toContain(missing)
    expect(scope.isDone()).toBe(false)
  })
})

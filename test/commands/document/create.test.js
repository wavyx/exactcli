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

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-document-create-'))
const FILES_DIR = mkdtempSync(join(tmpdir(), 'exactcli-files-'))

const { default: Cmd } =
  await import('../../../src/commands/document/create.js')

const DOC = '11111111-1111-1111-1111-111111111111'
const ATT_A = '22222222-2222-2222-2222-222222222222'
const ATT_B = '33333333-3333-3333-3333-333333333333'
const ACCOUNT = '44444444-4444-4444-4444-444444444444'
const DOCUMENTS = '/api/v1/123/documents/Documents'
const ATTACHMENTS = '/api/v1/123/documents/DocumentAttachments'
const ACCOUNTS = '/api/v1/123/crm/Accounts'
const LOOKUP = { $filter: "Code eq 'ACME'", $select: 'ID,Code,Name', $top: '2' }
const FILE_A = join(FILES_DIR, 'a.txt')
const FILE_B = join(FILES_DIR, 'b.bin')
const BYTES_B = Buffer.from([0, 255, 10])
const BASE = ['--subject', 'Invoice 2026-001', '--type', '183']
const b64 = (bytes) => Buffer.from(bytes).toString('base64')

beforeAll(() => {
  process.env.EXACTCLI_CONFIG_DIR = TMP_CONFIG_DIR
  process.env.EXACTCLI_ACCESS_TOKEN = 'test-token'
  process.env.EXACTCLI_DIVISION = '123'
  writeFileSync(FILE_A, 'hello')
  writeFileSync(FILE_B, BYTES_B)
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

/** Mock the three POSTs of a full run and record their bodies in order. */
function mockCreate(calls) {
  const record = (body) => {
    calls.push(body)
    return true
  }
  return mockApi()
    .post(DOCUMENTS, record)
    .reply(201, {
      d: {
        __metadata: { uri: 'x' },
        ID: DOC,
        Subject: 'Invoice 2026-001',
        Type: 183,
        TypeDescription: 'Attachment',
      },
    })
    .post(ATTACHMENTS, record)
    .reply(201, { d: { ID: ATT_A } })
    .post(ATTACHMENTS, record)
    .reply(201, { d: { ID: ATT_B } })
}

describe('document create', () => {
  it('--dry-run prints the request and the file sizes, never the bytes', async () => {
    const scope = mockApi().post(DOCUMENTS).reply(201, { d: {} })

    const text = await runCmd(Cmd, [
      ...BASE,
      '--file',
      FILE_A,
      '--file',
      FILE_B,
      '--dry-run',
    ])

    expect(JSON.parse(text)).toEqual({
      method: 'POST',
      path: DOCUMENTS,
      body: { Subject: 'Invoice 2026-001', Type: 183 },
      attachments: [
        { fileName: 'a.txt', size: 5 },
        { fileName: 'b.bin', size: 3 },
      ],
    })
    expect(text).not.toContain(b64('hello'))
    expect(scope.isDone()).toBe(false)
  })

  it('refuses without --allow-writes before any lookup', async () => {
    const scope = mockApi()
      .get(ACCOUNTS)
      .query(LOOKUP)
      .reply(200, { d: { results: [{ ID: ACCOUNT }] } })
      .post(DOCUMENTS)
      .reply(201, { d: {} })

    const err = await fail([...BASE, '--account', 'ACME', '--file', FILE_A])

    expect(exit(err)).toBe(77)
    expect(scope.isDone()).toBe(false)
  })

  it('POSTs the document, then one attachment per file, in order', async () => {
    const calls = []
    const scope = mockCreate(calls)

    const out = JSON.parse(
      await runCmd(Cmd, [
        ...BASE,
        '--file',
        FILE_A,
        '--file',
        FILE_B,
        '--allow-writes',
      ]),
    )

    expect(scope.isDone()).toBe(true)
    expect(calls).toEqual([
      { Subject: 'Invoice 2026-001', Type: 183 },
      { Document: DOC, FileName: 'a.txt', Attachment: b64('hello') },
      { Document: DOC, FileName: 'b.bin', Attachment: b64(BYTES_B) },
    ])
    expect(out).toEqual({
      ID: DOC,
      Subject: 'Invoice 2026-001',
      Type: 183,
      TypeDescription: 'Attachment',
      attachments: [
        { id: ATT_A, fileName: 'a.txt', size: 5 },
        { id: ATT_B, fileName: 'b.bin', size: 3 },
      ],
    })
  })

  it('prints the attachments in a table in a terminal', async () => {
    mockCreate([])
    process.stdout.isTTY = true

    const out = await runCmd(Cmd, [
      ...BASE,
      '--file',
      FILE_A,
      '--file',
      FILE_B,
      '--allow-writes',
    ])

    expect(out).toMatch(/Attachments/)
    expect(out).toMatch(/a\.txt \(5\), b\.bin \(3\)/)
  })

  it('fails with 65 on a missing file before any request', async () => {
    const scope = mockApi().post(DOCUMENTS).reply(201, { d: {} })
    const missing = join(FILES_DIR, 'missing.pdf')

    const err = await fail([
      ...BASE,
      '--file',
      FILE_A,
      '--file',
      missing,
      '--allow-writes',
    ])

    expect(exit(err)).toBe(65)
    expect(err.message).toContain(missing)
    expect(scope.isDone()).toBe(false)
  })

  it('fails with 64 on a --type that is not an integer', async () => {
    const err = await fail(['--subject', 'x', '--type', 'abc'])
    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/integer/)
  })

  it('looks up an account given as a code', async () => {
    const scope = mockApi()
      .get(ACCOUNTS)
      .query(LOOKUP)
      .reply(200, { d: { results: [{ ID: ACCOUNT }] } })

    const out = JSON.parse(
      await runCmd(Cmd, [...BASE, '--account', 'ACME', '--dry-run']),
    )

    expect(scope.isDone()).toBe(true)
    expect(out).toEqual({
      method: 'POST',
      path: DOCUMENTS,
      body: { Subject: 'Invoice 2026-001', Type: 183, Account: ACCOUNT },
      attachments: [],
    })
  })
})

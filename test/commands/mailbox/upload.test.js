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

const TMP_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'exactcli-mailbox-upload-'))
const FILES_DIR = mkdtempSync(join(tmpdir(), 'exactcli-files-'))

const { default: Cmd } = await import('../../../src/commands/mailbox/upload.js')

const OWN = '11111111-1111-1111-1111-111111111111'
const SCAN = '22222222-2222-2222-2222-222222222222'
const MSG = '33333333-3333-3333-3333-333333333333'
const ATT_A = '44444444-4444-4444-4444-444444444444'
const ATT_B = '55555555-5555-5555-5555-555555555555'
const TO = '66666666-6666-6666-6666-666666666666'
const DEFAULT = '/api/v1/123/read/mailbox/DefaultMailbox'
const MESSAGES = '/api/v1/123/mailbox/MailMessagesSent'
const ATTACHMENTS = '/api/v1/123/mailbox/MailMessageAttachments'
const OWN_ROW = {
  ID: OWN,
  Mailbox: '123@exact.test',
  IsScanServiceMailbox: false,
}
const SCAN_ROW = {
  ID: SCAN,
  Mailbox: 'scan@exact.test',
  IsScanServiceMailbox: true,
}
const FILE_A = join(FILES_DIR, 'a.txt')
const FILE_B = join(FILES_DIR, 'b.bin')
const BYTES_B = Buffer.from([0, 255, 10])
const BASE = ['--subject', 'Invoices week 36', '--operation', '2']
const MESSAGE = {
  Subject: 'Invoices week 36',
  SenderMailboxID: OWN,
  RecipientMailboxID: SCAN,
  Operation: 2,
}
const b64 = (bytes) => Buffer.from(bytes).toString('base64')
const rows = (list) => ({ d: { results: list } })

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
const mockDefault = (list) => mockApi().get(DEFAULT).reply(200, rows(list))

/** Mock the message and attachment POSTs and record their bodies in order. */
function mockSend(calls) {
  const record = (body) => {
    calls.push(body)
    return true
  }
  return mockApi()
    .post(MESSAGES, record)
    .reply(201, {
      d: { __metadata: { uri: 'x' }, ID: MSG, RecipientMailboxID: SCAN },
    })
    .post(ATTACHMENTS, record)
    .reply(201, { d: { ID: ATT_A } })
    .post(ATTACHMENTS, record)
    .reply(201, { d: { ID: ATT_B } })
}

describe('mailbox upload', () => {
  it('--dry-run resolves the mailboxes, prints the request and the sizes, posts nothing', async () => {
    const lookup = mockDefault([OWN_ROW, SCAN_ROW])
    const scope = mockApi().post(MESSAGES).reply(201, { d: {} })

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
      path: MESSAGES,
      body: MESSAGE,
      attachments: [
        { fileName: 'a.txt', size: 5 },
        { fileName: 'b.bin', size: 3 },
      ],
    })
    expect(text).not.toContain(b64('hello'))
    expect(lookup.isDone()).toBe(true)
    expect(scope.isDone()).toBe(false)
  })

  it('refuses without --allow-writes before the mailbox lookup', async () => {
    const scope = mockDefault([OWN_ROW, SCAN_ROW])
      .post(MESSAGES)
      .reply(201, { d: {} })

    const err = await fail([...BASE, '--file', FILE_A])

    expect(exit(err)).toBe(77)
    expect(scope.isDone()).toBe(false)
  })

  it('sends from the own mailbox to the scan service, then one attachment per file', async () => {
    const calls = []
    const lookup = mockDefault([OWN_ROW, SCAN_ROW])
    const scope = mockSend(calls)

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

    expect(lookup.isDone()).toBe(true)
    expect(scope.isDone()).toBe(true)
    expect(calls).toEqual([
      MESSAGE,
      {
        MailMessageID: MSG,
        AttachmentFileName: 'a.txt',
        Attachment: b64('hello'),
      },
      {
        MailMessageID: MSG,
        AttachmentFileName: 'b.bin',
        Attachment: b64(BYTES_B),
      },
    ])
    expect(out).toEqual({
      ID: MSG,
      RecipientMailboxID: SCAN,
      attachments: [
        { id: ATT_A, fileName: 'a.txt', size: 5 },
        { id: ATT_B, fileName: 'b.bin', size: 3 },
      ],
    })
  })

  it('--to sends to that mailbox; the subject defaults to the first file name', async () => {
    const calls = []
    mockDefault([OWN_ROW])
    const scope = mockApi()
      .post(MESSAGES, (body) => calls.push(body))
      .reply(201, { d: { ID: MSG } })
      .post(ATTACHMENTS)
      .reply(201, { d: { ID: ATT_A } })

    const out = JSON.parse(
      await runCmd(Cmd, ['--to', TO, '--file', FILE_A, '--allow-writes']),
    )

    expect(scope.isDone()).toBe(true)
    expect(calls).toEqual([
      { Subject: 'a.txt', SenderMailboxID: OWN, RecipientMailboxID: TO },
    ])
    expect(out).toEqual({
      ID: MSG,
      RecipientMailboxID: TO,
      attachments: [{ id: ATT_A, fileName: 'a.txt', size: 5 }],
    })
  })

  it('uses the one default mailbox as sender and recipient', async () => {
    mockDefault([SCAN_ROW])

    const out = JSON.parse(
      await runCmd(Cmd, [...BASE, '--file', FILE_A, '--dry-run']),
    )

    expect(out.body).toEqual({ ...MESSAGE, SenderMailboxID: SCAN })
  })

  it('prints a one-row table in a terminal', async () => {
    mockDefault([OWN_ROW, SCAN_ROW])
    mockSend([])
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
    expect(out).toContain(SCAN)
  })

  it('fails with 65 when the division has no default mailbox', async () => {
    mockDefault([])
    const scope = mockApi().post(MESSAGES).reply(201, { d: {} })

    const err = await fail([...BASE, '--file', FILE_A, '--allow-writes'])

    expect(exit(err)).toBe(65)
    expect(err.message).toMatch(/No default mailbox/)
    expect(scope.isDone()).toBe(false)
  })

  it('fails with 65 on a missing file before any request', async () => {
    const scope = mockDefault([OWN_ROW, SCAN_ROW])
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

  it('fails with 64 on a --to that is not a GUID before any request', async () => {
    const scope = mockDefault([OWN_ROW, SCAN_ROW])

    const err = await fail(['--to', 'scan', '--file', FILE_A, '--allow-writes'])

    expect(exit(err)).toBe(64)
    expect(err.message).toMatch(/--to must be a mailbox GUID/)
    expect(scope.isDone()).toBe(false)
  })
})

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
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mockApi, runCmd } from '../../helpers.js'

const TMP_CONFIG_DIR = mkdtempSync(
  join(tmpdir(), 'exactcli-document-download-'),
)

const { default: Cmd } =
  await import('../../../src/commands/document/download.js')

const ID = '11111111-1111-1111-1111-111111111111'
const PATH = '/api/v1/123/documents/DocumentAttachments'
const QUERY = {
  $filter: `Document eq guid'${ID}'`,
  $select: 'ID,FileName,FileSize,Attachment,Url',
}
const b64 = (text) => Buffer.from(text).toString('base64')

let outDir
beforeAll(() => {
  process.env.EXACTCLI_CONFIG_DIR = TMP_CONFIG_DIR
  process.env.EXACTCLI_ACCESS_TOKEN = 'test-token'
  process.env.EXACTCLI_DIVISION = '123'
})

afterAll(() => {
  delete process.env.EXACTCLI_CONFIG_DIR
  delete process.env.EXACTCLI_ACCESS_TOKEN
  delete process.env.EXACTCLI_DIVISION
  rmSync(TMP_CONFIG_DIR, { recursive: true, force: true })
})

beforeEach(() => {
  nock.disableNetConnect()
  process.stdout.isTTY = false
  outDir = join(mkdtempSync(join(tmpdir(), 'exactcli-attachments-')), 'out')
})

afterEach(() => {
  nock.cleanAll()
  nock.enableNetConnect()
})

function attachments(rows) {
  return mockApi()
    .get(PATH)
    .query(QUERY)
    .reply(200, { d: { results: rows } })
}

describe('document download', () => {
  it('writes every attachment into --out and reports the files', async () => {
    const scope = attachments([
      { ID: 'a', FileName: 'a.txt', FileSize: 5, Attachment: b64('hello') },
      { ID: 'b', FileName: '../b.txt', FileSize: 5, Attachment: b64('world') },
    ])

    const out = JSON.parse(await runCmd(Cmd, [ID, '--out', outDir]))

    expect(scope.isDone()).toBe(true)
    expect(readFileSync(join(outDir, 'a.txt'), 'utf8')).toBe('hello')
    expect(readFileSync(join(outDir, 'b.txt'), 'utf8')).toBe('world')
    expect(out).toEqual([
      { fileName: 'a.txt', size: 5, path: join(outDir, 'a.txt') },
      { fileName: 'b.txt', size: 5, path: join(outDir, 'b.txt') },
    ])
  })

  it('prints a table in a terminal and writes an empty file for a missing Attachment', async () => {
    attachments([{ ID: 'a', FileName: 'empty.bin', FileSize: 0 }])
    process.stdout.isTTY = true

    const out = await runCmd(Cmd, [ID, '--out', outDir])

    expect(out).toMatch(/empty\.bin/)
    expect(readFileSync(join(outDir, 'empty.bin')).length).toBe(0)
  })

  it('refuses to overwrite without --force and writes nothing', async () => {
    attachments([
      { ID: 'a', FileName: 'a.txt', Attachment: b64('new') },
      { ID: 'b', FileName: 'b.txt', Attachment: b64('new') },
    ])
    rmSync(outDir, { recursive: true, force: true })
    writeFileSync(join(outDir, '..', 'b.txt'), 'old')
    const target = join(outDir, '..')
    process.stdout.isTTY = true

    const err = await Cmd.run([ID, '--out', target]).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(65)
    expect(err.message).toBe(`${join(target, 'b.txt')} exists. Add --force`)
    expect(readFileSync(join(target, 'b.txt'), 'utf8')).toBe('old')
    expect(existsSync(join(target, 'a.txt'))).toBe(false)
  })

  it('overwrites with --force', async () => {
    attachments([{ ID: 'a', FileName: 'a.txt', Attachment: b64('new') }])
    const target = join(outDir, '..')
    writeFileSync(join(target, 'a.txt'), 'old')

    await runCmd(Cmd, [ID, '--out', target, '--force'])

    expect(readFileSync(join(target, 'a.txt'), 'utf8')).toBe('new')
  })

  it('fails with 65 when the document has no attachment', async () => {
    attachments([])
    process.stdout.isTTY = true

    const err = await Cmd.run([ID, '--out', outDir]).catch((e) => e)

    expect(err.exitCode ?? err.oclif?.exit).toBe(65)
    expect(err.message).toBe(`No attachment on document ${ID}`)
    expect(existsSync(outDir)).toBe(false)
  })

  it('rejects a document id that is not a GUID with 64', async () => {
    process.stdout.isTTY = true
    const err = await Cmd.run(['700', '--out', outDir]).catch((e) => e)
    expect(err.exitCode ?? err.oclif?.exit).toBe(64)
    expect(err.message).toMatch(/must be a GUID/)
  })

  it('fetches the bytes from the Url with Download=1 when Attachment is null', async () => {
    const url =
      'https://start.exactonline.be/docs/SysAttachment.aspx?ID=a&_Division_=123&Stamp=BE001'
    attachments([
      {
        ID: 'a',
        FileName: 'probe.png',
        FileSize: 4,
        Attachment: null,
        Url: url,
      },
    ])
    const scope = mockApi()
      .get('/docs/SysAttachment.aspx')
      .query({ ID: 'a', _Division_: '123', Stamp: 'BE001', Download: '1' })
      .matchHeader('authorization', 'Bearer test-token')
      .reply(200, Buffer.from('PNG!'), { 'content-type': 'image/png' })

    const out = JSON.parse(await runCmd(Cmd, [ID, '--out', outDir]))

    expect(scope.isDone()).toBe(true)
    expect(readFileSync(join(outDir, 'probe.png'), 'utf8')).toBe('PNG!')
    expect(out).toEqual([
      { fileName: 'probe.png', size: 4, path: join(outDir, 'probe.png') },
    ])
  })
})

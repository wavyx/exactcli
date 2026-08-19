import { describe, it, expect, beforeEach } from 'vitest'
import { runCmd } from '../helpers.js'

const { default: VersionCommand } =
  await import('../../src/commands/version.js')

describe('version', () => {
  beforeEach(() => {
    process.stdout.isTTY = true
  })

  it('prints one line with the version, node and platform', async () => {
    const out = await runCmd(VersionCommand, [])
    expect(out).toMatch(/^exactcli\/\d+\.\d+\.\d+ node\/v\d+.* \w+-\w+$/)
  })

  it('prints an object in json mode', async () => {
    const out = JSON.parse(await runCmd(VersionCommand, ['--output', 'json']))
    expect(out).toEqual({
      exactcli: expect.stringMatching(/^\d+\.\d+\.\d+/),
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
    })
  })
})

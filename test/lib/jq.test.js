import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { jqBinaryExists, jqBinaryPath } from '../../src/lib/jq.js'

const savedJq = process.env.JQ_PATH
const savedNpm = process.env.npm_config_jq_path
const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')

/** @param {string} value */
function setPlatform(value) {
  Object.defineProperty(process, 'platform', { value, configurable: true })
}

function restore(name, saved) {
  if (saved === undefined) delete process.env[name]
  else process.env[name] = saved
}

beforeEach(() => {
  delete process.env.JQ_PATH
  delete process.env.npm_config_jq_path
})

afterEach(() => {
  Object.defineProperty(process, 'platform', platformDescriptor)
  restore('JQ_PATH', savedJq)
  restore('npm_config_jq_path', savedNpm)
})

describe('jqBinaryPath', () => {
  it('prefers JQ_PATH over every other source', () => {
    process.env.JQ_PATH = '/opt/bin/jq'
    process.env.npm_config_jq_path = '/opt/npm/jq'
    expect(jqBinaryPath()).toBe('/opt/bin/jq')
  })

  it('falls back to npm_config_jq_path', () => {
    process.env.npm_config_jq_path = '/opt/npm/jq'
    expect(jqBinaryPath()).toBe('/opt/npm/jq')
  })

  it('falls back to the binary that node-jq downloads', () => {
    setPlatform('linux')
    expect(jqBinaryPath()).toMatch(/node-jq[\\/]bin[\\/]jq$/)
  })

  it('names jq.exe on windows', () => {
    setPlatform('win32')
    expect(jqBinaryPath()).toMatch(/node-jq[\\/]bin[\\/]jq\.exe$/)
  })
})

describe('jqBinaryExists', () => {
  it('is true when the binary is there', () => {
    process.env.JQ_PATH = process.execPath
    expect(jqBinaryExists()).toBe(true)
  })

  it('is false when the binary is missing', () => {
    process.env.JQ_PATH = '/nonexistent/jq'
    expect(jqBinaryExists()).toBe(false)
  })
})

import { describe, it, expect } from 'vitest'
import { formatYaml } from '../../../src/lib/output/yaml.js'

describe('formatYaml', () => {
  it('formats an object as YAML', () => {
    const result = formatYaml({ ID: 1, Name: 'Acme' })
    expect(result).toContain('ID: 1')
    expect(result).toContain('Name: Acme')
  })

  it('formats an array as YAML', () => {
    const result = formatYaml([{ ID: 1 }, { ID: 2 }])
    expect(result).toContain('- ID: 1')
    expect(result).toContain('- ID: 2')
  })
})

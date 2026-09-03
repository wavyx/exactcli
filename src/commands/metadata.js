import { Args, Flags } from '@oclif/core'
import BaseCommand from '../base-command.js'
import { CliError } from '../lib/errors.js'
import {
  filterableFields,
  findResource,
  loadCatalog,
  mandatoryFields,
  searchResources,
  shortName,
} from '../lib/catalog.js'

export { shortName }

const PROPERTY_COLUMNS = {
  name: { header: 'Name' },
  type: { header: 'Type' },
  key: { header: 'Key' },
  mandatory: { header: 'Mandatory' },
  filter: { header: 'Filter' },
  post: { header: 'Post' },
  put: { header: 'Put' },
  description: { header: 'Description' },
}

const SUMMARY_COLUMNS = {
  uri: { header: 'Uri' },
  family: { header: 'Family' },
  methods: { header: 'Methods', get: (r) => r.methods.join(' ') },
  keys: { header: 'Keys', get: (r) => r.keys.join(' ') },
  webhook: { header: 'Webhook' },
  scope: { header: 'Scope' },
  properties: { header: 'Properties' },
}

const RESOURCE_COLUMNS = {
  resource: { header: 'Resource' },
  family: { header: 'Family' },
  methods: { header: 'Methods' },
  properties: { header: 'Properties' },
}

export default class MetadataCommand extends BaseCommand {
  static skipAuth = true

  static description =
    'Show the fields of a resource, or search the resource catalogue'

  static examples = [
    '<%= config.bin %> metadata crm/Accounts',
    '<%= config.bin %> metadata crm/Accounts --mandatory',
    '<%= config.bin %> metadata --search invoice',
    '<%= config.bin %> metadata salesentry/SalesEntries --methods --output json',
  ]

  static args = {
    resource: Args.string({
      description: 'Resource path, for example crm/Accounts',
    }),
  }

  static flags = {
    search: Flags.string({
      description: 'Search the catalogue for resources that match a word',
    }),
    mandatory: Flags.boolean({
      description: 'Only the mandatory properties',
    }),
    filterable: Flags.boolean({
      description: 'Only the properties that $filter accepts',
    }),
    methods: Flags.boolean({
      description: 'Show the resource summary instead of the properties',
    }),
  }

  async run() {
    const { args } = await this.parse(MetadataCommand)
    const catalog = loadCatalog()

    if (this.flags.search) {
      const rows = searchResources(this.flags.search, catalog).map((r) => ({
        resource: shortName(r),
        family: r.family,
        methods: r.methods.join(' '),
        properties: r.properties.length,
      }))
      await this.outputResults(rows, RESOURCE_COLUMNS)
      return
    }

    if (!args.resource) {
      throw new CliError('Give a resource, or use --search <word>', {
        exitCode: 64,
      })
    }

    const res = findResource(args.resource, catalog)
    if (!res) {
      const date = catalog.generatedAt.slice(0, 10)
      throw new CliError(
        `${args.resource} is not in the catalogue of ${date}. ` +
          'Try: exactcli metadata --search <word>',
        { exitCode: 65 },
      )
    }

    if (this.flags.methods) {
      await this.outputResults(
        {
          uri: res.uri,
          family: res.family,
          methods: res.methods,
          keys: res.keys,
          webhook: res.webhook,
          scope: res.scope,
          mandatoryFilters: res.mandatoryFilters,
          properties: res.properties.length,
        },
        SUMMARY_COLUMNS,
      )
      return
    }

    const mandatory = new Set(mandatoryFields(res))
    const filterable = new Set(filterableFields(res))
    let props = res.properties.filter((p) => !p.hidden)
    if (this.flags.mandatory) props = props.filter((p) => mandatory.has(p.name))
    if (this.flags.filterable) {
      props = props.filter((p) => filterable.has(p.name))
    }
    const rows = props.map(
      ({ name, type, key, mandatory, filter, post, put, description }) => ({
        name,
        type,
        key,
        mandatory,
        filter,
        post,
        put,
        description,
      }),
    )
    await this.outputResults(rows, PROPERTY_COLUMNS)
  }
}

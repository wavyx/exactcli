import { lineDescriptors } from '../../lib/typed/line-descriptors.js'
import { lineSpec } from '../../lib/typed/line-write.js'
import { defineRecordDeleteCommand } from '../../lib/typed/record-write.js'

export default defineRecordDeleteCommand(lineSpec(lineDescriptors.salesInvoice))

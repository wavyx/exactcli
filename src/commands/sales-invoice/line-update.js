import { lineDescriptors } from '../../lib/typed/line-descriptors.js'
import { lineSpec } from '../../lib/typed/line-write.js'
import { defineRecordUpdateCommand } from '../../lib/typed/record-write.js'

export default defineRecordUpdateCommand(lineSpec(lineDescriptors.salesInvoice))

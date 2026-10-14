import { defineUpdateCommand } from '../../lib/typed/header-write.js'
import { lineDescriptors } from '../../lib/typed/line-descriptors.js'

export default defineUpdateCommand(lineDescriptors.purchaseOrder)

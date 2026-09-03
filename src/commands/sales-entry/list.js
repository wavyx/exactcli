import { columnsOf, descriptors } from '../../lib/typed/descriptors.js'
import { defineListCommand } from '../../lib/typed/factory.js'

export const COLUMNS = columnsOf(descriptors.salesEntry)
export default defineListCommand(descriptors.salesEntry)

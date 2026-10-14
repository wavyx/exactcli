import { records } from '../../lib/typed/records.js'
import { defineRecordDeleteCommand } from '../../lib/typed/record-write.js'

export default defineRecordDeleteCommand(records.item)

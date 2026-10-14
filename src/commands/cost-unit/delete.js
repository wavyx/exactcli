import { masterData } from '../../lib/typed/master-data.js'
import { defineRecordDeleteCommand } from '../../lib/typed/record-write.js'

export default defineRecordDeleteCommand(masterData.costUnit)

import { masterData } from '../../lib/typed/master-data.js'
import { defineRecordCreateCommand } from '../../lib/typed/record-write.js'

export default defineRecordCreateCommand(masterData.costUnit)

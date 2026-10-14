import { masterData } from '../../lib/typed/master-data.js'
import { defineRecordUpdateCommand } from '../../lib/typed/record-write.js'

export default defineRecordUpdateCommand(masterData.vatCode)

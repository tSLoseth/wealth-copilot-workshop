import { beforeEach, describe, expect, it } from 'vitest'
import type { ReportSpec } from '../api/reportTypes'
import { addSavedReport, loadSavedReports, removeSavedReport } from '../utils/savedReports'

const spec: ReportSpec = { id: 'ai-1', title: 'Teknologi', intro: 'Intro', blocks: [] }

describe('savedReports', () => {
  beforeEach(() => localStorage.clear())

  it('stores reports per customer', () => {
    addSavedReport('CUST-00101', spec, 'Teknologi')
    expect(loadSavedReports('CUST-00101')).toHaveLength(1)
    expect(loadSavedReports('CUST-00102')).toHaveLength(0)
    expect(localStorage.getItem('wc.savedReports.CUST-00101')).toContain('"title":"Teknologi"')
  })

  it('removes a report by saved_at', () => {
    const [saved] = addSavedReport('CUST-00101', spec, 'Teknologi')
    expect(removeSavedReport('CUST-00101', saved.saved_at)).toHaveLength(0)
  })

  it('ignores corrupt storage', () => {
    localStorage.setItem('wc.savedReports.CUST-00101', '{not json')
    expect(loadSavedReports('CUST-00101')).toEqual([])
  })
})

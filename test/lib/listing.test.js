import { describe, it, expect, vi } from 'vitest'
import {
  DEFAULT_PAGE_SIZE,
  collectListing,
  listingFlags,
  BULK_PAGE_SIZE,
  pageBudget,
  visibleColumns,
} from '../../src/lib/listing.js'

describe('pageBudget', () => {
  it('walks every page up to max-pages with --all', () => {
    expect(pageBudget({ all: true, maxPages: 7 })).toBe(7)
  })

  it('reads one page without --all or --limit', () => {
    expect(pageBudget({ maxPages: 100 })).toBe(1)
  })

  it('needs as many pages as the limit divided by the page size', () => {
    expect(pageBudget({ limit: 70, maxPages: 100 })).toBe(2)
    expect(pageBudget({ limit: 3, top: 2, maxPages: 100 })).toBe(2)
    expect(pageBudget({ limit: 60, maxPages: 100 })).toBe(1)
  })

  it('never exceeds max-pages', () => {
    expect(pageBudget({ limit: 100, top: 2, maxPages: 1 })).toBe(1)
  })

  it('exposes the Exact page size and the shared flags', () => {
    expect(DEFAULT_PAGE_SIZE).toBe(60)
    expect(Object.keys(listingFlags)).toEqual(
      expect.arrayContaining(['filter', 'top', 'all', 'max-pages', 'raw']),
    )
  })
})

describe('collectListing', () => {
  function fakeCmd(pages, flags = {}) {
    const apiClient = {
      lastNext: null,
      pageOData: vi.fn(async function* (path, query, { maxPages }) {
        let served = 0
        for (const page of pages) {
          if (served >= maxPages) break
          served++
          apiClient.lastNext = served < pages.length ? 'next' : null
          yield* page
        }
      }),
    }
    return { apiClient, flags: { 'max-pages': 100, ...flags } }
  }

  it('normalizes rows and uses the OData flags as the default query', async () => {
    const cmd = fakeCmd([[{ __metadata: {}, A: '/Date(0)/' }]], {
      filter: "X eq 'y'",
    })
    const rows = await collectListing(cmd, '/p')
    expect(rows).toEqual([{ A: '1970-01-01T00:00:00' }])
    expect(cmd.apiClient.pageOData).toHaveBeenCalledWith(
      '/p',
      { $filter: "X eq 'y'" },
      { maxPages: 1 },
    )
  })

  it('keeps raw rows and an explicit query', async () => {
    const cmd = fakeCmd([[{ __metadata: {}, A: 1 }]], { raw: true })
    const rows = await collectListing(cmd, '/p', { $select: 'A' })
    expect(rows).toEqual([{ __metadata: {}, A: 1 }])
    expect(cmd.apiClient.pageOData.mock.calls[0][1]).toEqual({ $select: 'A' })
  })

  it('truncates to --limit and reports the rest on stderr', async () => {
    const write = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true)
    try {
      const cmd = fakeCmd([[{ A: 1 }, { A: 2 }], [{ A: 3 }]], { limit: 1 })
      const rows = await collectListing(cmd, '/p')
      expect(rows).toEqual([{ A: 1 }])
      expect(write).toHaveBeenCalledWith(
        'More results available. Use --all or --limit.\n',
      )
    } finally {
      write.mockRestore()
    }
  })

  it('points --all at --max-pages when pages remain', async () => {
    const write = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true)
    try {
      const cmd = fakeCmd([[{ A: 1 }], [{ A: 2 }]], {
        all: true,
        'max-pages': 1,
      })
      const rows = await collectListing(cmd, '/p')
      expect(rows).toEqual([{ A: 1 }])
      expect(write).toHaveBeenCalledWith(
        'More results available. Raise --max-pages.\n',
      )
    } finally {
      write.mockRestore()
    }
  })

  it('falls back to 100 pages when the caller has no --max-pages', async () => {
    const cmd = fakeCmd([[{ A: 1 }]], { 'max-pages': undefined, all: true })
    await collectListing(cmd, '/p')
    expect(cmd.apiClient.pageOData).toHaveBeenCalledWith(
      '/p',
      {},
      { maxPages: 100 },
    )
  })

  it('follows every page with --all and stays quiet when exhausted', async () => {
    const write = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true)
    try {
      const cmd = fakeCmd([[{ A: 1 }], [{ A: 2 }]], { all: true })
      const rows = await collectListing(cmd, '/p')
      expect(rows).toEqual([{ A: 1 }, { A: 2 }])
      expect(write).not.toHaveBeenCalled()
    } finally {
      write.mockRestore()
    }
  })
})

describe('visibleColumns', () => {
  const columns = { A: { header: 'A' }, B: { header: 'B' }, C: { header: 'C' } }

  it('keeps every column without --select', () => {
    expect(visibleColumns(columns, [{ A: 1 }], undefined)).toBe(columns)
  })

  it('keeps only the columns the first row carries with --select', () => {
    expect(visibleColumns(columns, [{ A: 1, C: 3 }], 'A,C')).toEqual({
      A: { header: 'A' },
      C: { header: 'C' },
    })
  })

  it('drops every column when --select returns no rows', () => {
    expect(visibleColumns(columns, [], 'A')).toEqual({})
  })
})

describe('bulk paging', () => {
  it('budgets pages by the page size', () => {
    expect(
      pageBudget({ limit: 2500, maxPages: 100, pageSize: BULK_PAGE_SIZE }),
    ).toBe(3)
    expect(pageBudget({ limit: 2500, maxPages: 100 })).toBe(42)
  })
})

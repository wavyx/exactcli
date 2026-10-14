import { describe, it, expect, vi } from 'vitest'
import {
  DEFAULT_PAGE_SIZE,
  collectListing,
  listingFlags,
  BULK_PAGE_SIZE,
  countFlags,
  countListing,
  divisionsFlags,
  eachDivision,
  pageBudget,
  visibleColumns,
} from '../../src/lib/listing.js'

describe('pageBudget', () => {
  it('walks every page up to max-pages with --all', () => {
    expect(pageBudget({ all: true, maxPages: 7 })).toBe(7)
  })

  it('caps the pages by --limit also with --all', () => {
    expect(pageBudget({ all: true, limit: 50, maxPages: 100 })).toBe(1)
    expect(pageBudget({ all: true, limit: 130, maxPages: 100 })).toBe(3)
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

  it('keeps --limit with --all and points at --limit when it cuts', async () => {
    const write = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true)
    try {
      const cmd = fakeCmd([[{ A: 1 }, { A: 2 }], [{ A: 3 }]], {
        all: true,
        limit: 1,
      })
      const rows = await collectListing(cmd, '/p')
      expect(rows).toEqual([{ A: 1 }])
      expect(write).toHaveBeenCalledWith(
        'More results available. Raise --limit.\n',
      )
    } finally {
      write.mockRestore()
    }
  })

  it('names --max-pages when the page budget stops a walk under --limit', async () => {
    const write = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true)
    try {
      // --limit 10 with one page of 2 rows allowed: the pages ran out first.
      const cmd = fakeCmd([[{ A: 1 }, { A: 2 }], [{ A: 3 }]], {
        all: true,
        limit: 10,
        'max-pages': 1,
      })
      const rows = await collectListing(cmd, '/p')
      expect(rows).toEqual([{ A: 1 }, { A: 2 }])
      expect(write).toHaveBeenCalledWith(
        'More results available. Raise --max-pages.\n',
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

describe('countListing', () => {
  function fakeCmd(answer) {
    return { apiClient: { get: vi.fn(async () => answer) } }
  }

  it('asks $count with the $filter alone and returns the number', async () => {
    const cmd = fakeCmd('14379')
    const result = await countListing(cmd, '/api/v1/1/crm/Accounts', {
      $filter: "Status eq 'C'",
      $select: 'ID,Name',
      $orderby: 'Name asc',
      $top: 5,
    })

    expect(result).toEqual({ count: 14379 })
    expect(cmd.apiClient.get).toHaveBeenCalledWith(
      '/api/v1/1/crm/Accounts/$count',
      { query: { $filter: "Status eq 'C'" } },
    )
  })

  it('sends no $filter when the listing has none', async () => {
    const cmd = fakeCmd('0')
    expect(await countListing(cmd, '/api/v1/1/crm/Accounts', {})).toEqual({
      count: 0,
    })
    expect(cmd.apiClient.get).toHaveBeenCalledWith(
      '/api/v1/1/crm/Accounts/$count',
      { query: { $filter: undefined } },
    )
  })

  it('trims the text and takes a number that arrived as JSON', async () => {
    expect(await countListing(fakeCmd(' 12\r\n'), '/p', {})).toEqual({
      count: 12,
    })
    expect(await countListing(fakeCmd(42), '/p', {})).toEqual({ count: 42 })
  })

  it('fails with 65 when the answer is not a count', async () => {
    for (const answer of [null, '', '  ', 'abc', '-1', '1.5', { d: {} }]) {
      await expect(countListing(fakeCmd(answer), '/p', {})).rejects.toThrow(
        expect.objectContaining({ exitCode: 65 }),
      )
    }
  })

  it('exposes the --count flag', () => {
    expect(Object.keys(countFlags)).toEqual(['count'])
  })
})

describe('eachDivision', () => {
  function fakeCmd(flags, codes = [123, 456]) {
    const cmd = {
      flags,
      resolveDivision: () => Number(cmd.flags.division ?? 123),
      apiClient: {
        pageOData: vi.fn(async function* () {
          yield* codes.map((Code) => ({ Code }))
        }),
      },
    }
    return cmd
  }

  it('runs once for the active division without the flag', async () => {
    const cmd = fakeCmd({})
    const run = vi.fn(async () => [{ a: 1 }])

    expect(await eachDivision(cmd, run)).toEqual([{ a: 1 }])
    expect(run).toHaveBeenCalledTimes(1)
    expect(cmd.apiClient.pageOData).not.toHaveBeenCalled()
  })

  it('runs per accessible division and tags every row with its division', async () => {
    // The division flag drives every lookup of the run, so a code resolves
    // in the division that is being read.
    const cmd = fakeCmd({ 'all-divisions': true, division: '123' })
    const seen = []
    const run = vi.fn(async () => {
      seen.push(cmd.flags.division)
      return [{ a: seen.length }]
    })

    expect(await eachDivision(cmd, run)).toEqual([
      { Division: 123, a: 1 },
      { Division: 456, a: 2 },
    ])
    expect(seen).toEqual(['123', '456'])
    expect(cmd.apiClient.pageOData).toHaveBeenCalledWith(
      '/api/v1/123/hrm/Divisions',
      { $select: 'Code', $orderby: 'Code' },
    )
  })

  it('tags a single result object, such as a count', async () => {
    const cmd = fakeCmd({ 'all-divisions': true })
    const run = vi.fn(async () => ({ count: 2 }))

    expect(await eachDivision(cmd, run)).toEqual([
      { Division: 123, count: 2 },
      { Division: 456, count: 2 },
    ])
  })

  it('skips a division that lacks the code or the module, and says so on stderr', async () => {
    const { ApiError, RefNotFoundError } =
      await import('../../src/lib/errors.js')
    const cmd = fakeCmd({ 'all-divisions': true }, [1, 2, 3])
    const failures = {
      1: new RefNotFoundError('No crm/Accounts with Code 1001'),
      2: new ApiError(403, { message: 'Forbidden' }, '/api/v1/2/x'),
    }
    const run = vi.fn(async () => {
      const failure = failures[cmd.flags.division]
      if (failure) throw failure
      return [{ a: 1 }]
    })
    const chunks = []
    const spy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk) => chunks.push(String(chunk)) > 0)

    let rows
    try {
      rows = await eachDivision(cmd, run)
    } finally {
      spy.mockRestore()
    }

    expect(rows).toEqual([{ Division: 3, a: 1 }])
    expect(chunks.join('')).toBe(
      'Division 1 skipped: No crm/Accounts with Code 1001\n' +
        'Division 2 skipped: Exact Online API 403: Forbidden\n',
    )
  })

  it('stops on any other failure', async () => {
    const { ApiError } = await import('../../src/lib/errors.js')
    const cmd = fakeCmd({ 'all-divisions': true })
    const run = vi.fn(async () => {
      throw new ApiError(400, { message: 'Bad filter' }, '/x')
    })

    await expect(eachDivision(cmd, run)).rejects.toThrow(/Bad filter/)
  })

  it('exposes the --all-divisions flag', () => {
    expect(Object.keys(divisionsFlags)).toEqual(['all-divisions'])
  })
})

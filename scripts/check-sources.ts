// Probes every configured job board (lib/engine/companies.ts) with the same
// request the engine makes, and prints the outcome per board:
//   npm run sources:check            (all boards)
//   npm run sources:check -- ashby   (one provider)
// Read-only: no database access, no secrets. Run it from a machine that can
// reach boards-api.greenhouse.io, api.lever.co and api.ashbyhq.com.
import { COMPANY_BOARDS } from '../lib/engine/companies'
import { fetchBoard, SourceError } from '../lib/engine/sources'

const only = process.argv[2]
const boards = COMPANY_BOARDS.filter(b => !only || b.provider === only)
const rows: { provider: string; slug: string; company: string; outcome: string; status: string; jobs: string }[] = []

for (let i = 0; i < boards.length; i += 6) {
  await Promise.all(
    boards.slice(i, i + 6).map(async board => {
      try {
        const jobs = await fetchBoard(board)
        rows.push({ ...board, outcome: 'ok', status: '200', jobs: String(jobs.length) })
      } catch (err) {
        if (err instanceof SourceError) rows.push({ ...board, outcome: err.kind, status: err.status === null ? '-' : String(err.status), jobs: '-' })
        else rows.push({ ...board, outcome: 'error', status: '-', jobs: (err as Error).message.slice(0, 60) })
      }
    }),
  )
}

rows.sort((a, b) => a.provider.localeCompare(b.provider) || a.outcome.localeCompare(b.outcome) || a.slug.localeCompare(b.slug))
console.table(rows)
const summary: Record<string, Record<string, number>> = {}
for (const r of rows) (summary[r.provider] ??= {})[r.outcome] = (summary[r.provider][r.outcome] ?? 0) + 1
console.log(JSON.stringify(summary, null, 2))

export interface Commit {
  sha: string; author: string; date: string; subject: string; body: string
  type: string; scope: string; status: string; branches: string[]
  module?: string; process?: string
}
export interface CommitSet { repo: string; syncedAt: string; commits: Commit[]; catalog?: { name: string; processes: string[] }[] }

export const ENVS = ['PROD', 'main', 'QA', 'DEV'] as const
export const TYPES: Record<string, string> = {
  feat: 'Nueva función', fix: 'Corrección', refactor: 'Refactor', docs: 'Documentación', style: 'Estilo',
  test: 'Pruebas', chore: 'Mantenimiento', ci: 'CI', perf: 'Rendimiento', build: 'Build', otro: 'Otro',
}
export function parseSubject(s: string) {
  const m = s.match(/^(\w+)(?:\(([^)]+)\))?!?:\s*(.*)$/)
  return m ? { type: m[1].toLowerCase(), scope: m[2] ?? '', subject: m[3] } : { type: 'otro', scope: '', subject: s }
}
export const statusOf = (branches: string[]) =>
  ENVS.find(e => branches.includes(e as string)) ?? 'Rama'

/* Lectura en vivo desde GitHub (versión instalable). El token solo se guarda en este navegador. */
const REPO = 'core-plus-solutions/core-plus-vite'
export async function fetchLive(token: string, author: string): Promise<CommitSet> {
  const h = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
  const map = new Map<string, Commit>()
  for (const env of ENVS) {
    const r = await fetch(`https://api.github.com/repos/${REPO}/commits?sha=${env}&author=${encodeURIComponent(author)}&per_page=100`, { headers: h })
    if (r.status === 401) throw new Error('Token inválido o vencido.')
    if (!r.ok) continue
    for (const c of await r.json()) {
      const [first, ...rest] = (c.commit.message as string).split('\n')
      const p = parseSubject(first)
      const cur = map.get(c.sha) ?? { sha: c.sha, author: c.commit.author.name, date: c.commit.author.date,
        subject: p.subject, body: rest.join('\n').replace(/Co-Authored-By:.*$/gim, '').trim(), type: p.type, scope: p.scope, status: '', branches: [] as string[] }
      cur.branches.push(env); map.set(c.sha, cur)
    }
  }
  const commits = [...map.values()].map(c => ({ ...c, status: statusOf(c.branches) })).sort((a, b) => b.date.localeCompare(a.date))
  return { repo: REPO, syncedAt: new Date().toISOString(), commits }
}

/* ---- Aplicar / reversar con la GitHub Action apply-commits.yml ---- */
export const WORKFLOW = 'apply-commits.yml'
export type Op = 'aplicar' | 'reversar'
export interface Run { id: number; status: string; conclusion: string | null; html_url: string }
const gh = (token: string) => ({ Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' })

export async function dispatchApply(token: string, repo: string, env: string, op: Op, shas: string[]): Promise<number> {
  const since = Date.now() - 5000
  const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: 'POST', headers: gh(token), body: JSON.stringify({ ref: 'main', inputs: { env, action: op, shas: shas.join(' ') } }),
  })
  if (r.status === 404) throw new Error('No se encontró el workflow apply-commits.yml en main, o el token no tiene permiso de Actions.')
  if (r.status === 403 || r.status === 401) throw new Error('El token no tiene permiso para ejecutar Actions (Actions: Read and write).')
  if (!r.ok) throw new Error(`GitHub respondió ${r.status}.`)
  return since
}
export async function latestRun(token: string, repo: string, since: number): Promise<Run | null> {
  const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW}/runs?event=workflow_dispatch&per_page=5`, { headers: gh(token) })
  if (!r.ok) return null
  const runs = (await r.json()).workflow_runs as (Run & { created_at: string })[]
  return runs.find(x => Date.parse(x.created_at) >= since) ?? null
}

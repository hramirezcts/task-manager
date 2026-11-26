export interface Commit {
  sha: string; author: string; date: string; subject: string; body: string
  type: string; scope: string; status: string; branches: string[]
}
export interface CommitSet { repo: string; syncedAt: string; commits: Commit[] }

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

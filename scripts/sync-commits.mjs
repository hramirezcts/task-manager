// Uso: node scripts/sync-commits.mjs <ruta-repo> [autor] [cantidad]  → escribe commits.json
import { execFileSync } from 'child_process'
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
const CAT = fileURLToPath(new URL('./coreplus-catalog.json', import.meta.url))
const catalog = existsSync(CAT) ? JSON.parse(readFileSync(CAT, 'utf8')).modules : []
const has = (txt, keys) => keys.some(k => txt.includes(k))
function classify(scope, text) {
  const sc = (scope || '').toLowerCase(), t = (sc + ' ' + text).toLowerCase()
  const mod = catalog.find(m => sc && has(sc, m.keys)) || catalog.find(m => has(t, m.keys))
  if (!mod) return { module: 'Sin módulo', process: '' }
  const score = p => Math.max(0, ...p.keys.filter(k => t.includes(k)).map(k => k.length))
  const pr = [...mod.processes].sort((a, b) => score(b) - score(a)).find(p => score(p) > 0)
  return { module: mod.name, process: pr ? pr.name : 'General' }
}
const [repo = '.', author = 'hramirezcts', n = '300'] = process.argv.slice(2)
const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', maxBuffer: 1 << 26 })
const ENVS = ['PROD', 'main', 'QA', 'DEV']
try { git('fetch', '--quiet', 'origin') } catch { console.warn('fetch falló; uso refs locales') }
const sets = Object.fromEntries(ENVS.map(e => {
  try { return [e, new Set(git('rev-list', '--max-count=5000', `origin/${e}`).split('\n'))] } catch { return [e, new Set()] }
}))
const SEP = '\x1e', F = '\x1f'
const raw = git('log', '--branches', '--remotes', '--no-merges', `--author=${author}`, `-n`, n, `--format=%H${F}%an${F}%aI${F}%s${F}%b${SEP}`)
const commits = raw.split(SEP).map(x => x.trim()).filter(Boolean).map(x => {
  const [sha, an, date, s, b] = x.split(F)
  const m = s.match(/^(\w+)(?:\(([^)]+)\))?!?:\s*(.*)$/)
  const branches = ENVS.filter(e => sets[e].has(sha))
  return { sha, author: an, date, subject: m ? m[3] : s, type: m ? m[1].toLowerCase() : 'otro', scope: m?.[2] ?? '',
    body: (b || '').replace(/Co-Authored-By:.*$/gim, '').trim().slice(0, 400),
    ...classify(m?.[2], s + ' ' + (b || '')),
    branches, status: ENVS.find(e => branches.includes(e)) ?? 'Rama' }
})
const remote = git('remote', 'get-url', 'origin').trim().replace(/^.*github\.com[/:]|\.git$/g, '')
writeFileSync('commits.json', JSON.stringify({ repo: remote, catalog: catalog.map(m => ({ name: m.name, processes: m.processes.map(p => p.name) })), syncedAt: new Date().toISOString(), commits }))
console.log(`${commits.length} commits → commits.json`)

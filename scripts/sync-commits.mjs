// Uso: node scripts/sync-commits.mjs <ruta-repo> [autor] [cantidad]  → escribe commits.json
import { execFileSync } from 'child_process'
import { writeFileSync } from 'fs'
const [repo = '.', author = 'hramirezcts', n = '300'] = process.argv.slice(2)
const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', maxBuffer: 1 << 26 })
const ENVS = ['PROD', 'main', 'QA', 'DEV']
try { git('fetch', '--quiet', 'origin') } catch { console.warn('fetch falló; uso refs locales') }
const sets = Object.fromEntries(ENVS.map(e => {
  try { return [e, new Set(git('rev-list', '--max-count=5000', `origin/${e}`).split('\n'))] } catch { return [e, new Set()] }
}))
const SEP = '\x1e', F = '\x1f'
const raw = git('log', '--all', '--no-merges', `--author=${author}`, `-n`, n, `--format=%H${F}%an${F}%aI${F}%s${F}%b${SEP}`)
const commits = raw.split(SEP).map(x => x.trim()).filter(Boolean).map(x => {
  const [sha, an, date, s, b] = x.split(F)
  const m = s.match(/^(\w+)(?:\(([^)]+)\))?!?:\s*(.*)$/)
  const branches = ENVS.filter(e => sets[e].has(sha))
  return { sha, author: an, date, subject: m ? m[3] : s, type: m ? m[1].toLowerCase() : 'otro', scope: m?.[2] ?? '',
    body: (b || '').replace(/Co-Authored-By:.*$/gim, '').trim().slice(0, 400),
    branches, status: ENVS.find(e => branches.includes(e)) ?? 'Rama' }
})
const remote = git('remote', 'get-url', 'origin').trim().replace(/^.*github\.com[/:]|\.git$/g, '')
writeFileSync('commits.json', JSON.stringify({ repo: remote, syncedAt: new Date().toISOString(), commits }))
console.log(`${commits.length} commits → commits.json`)

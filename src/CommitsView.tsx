import { useEffect, useState } from 'react'
import { sharedDb } from './store'
import { fetchLive, TYPES, ENVS, type CommitSet } from './commits'

const LS = 'tm-github'
const read = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}') } catch { return {} } }
const write = (v: object) => { try { localStorage.setItem(LS, JSON.stringify(v)) } catch { /* sin almacenamiento */ } }
const STATUS_LABEL: Record<string, string> = { PROD: 'Producción', main: 'main', QA: 'QA', DEV: 'DEV', Rama: 'Solo en rama' }
const STATES = [...ENVS, 'Rama']
const when = (d: string) => new Date(d).toLocaleString('es', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export function CommitsView() {
  const [set, setSet] = useState<CommitSet | null>(null)
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const [cfg, setCfg] = useState<{ token?: string; author?: string }>(read)
  const [q, setQ] = useState(''), [st, setSt] = useState(''), [ty, setTy] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const live = async (c = cfg) => {
    if (!c.token) return
    setBusy(true); setErr('')
    try { setSet(await fetchLive(c.token, c.author || 'hramirezcts')) } catch (e) { setErr(String((e as Error).message || e)) }
    setBusy(false)
  }
  useEffect(() => {
    if (sharedDb) {
      setBusy(true)
      sharedDb.doc('commits/latest').get()
        .then((d: any) => { if (d.exists) setSet(d.data()); else setErr('Aún no hay commits sincronizados.') })
        .catch(() => setErr('No se pudieron leer los commits.')).finally(() => setBusy(false))
    } else live()
  }, [])

  const all = set?.commits ?? []
  const list = all.filter(c => (!st || c.status === st) && (!ty || c.type === ty)
    && (!q || (c.subject + c.body + c.scope + c.sha).toLowerCase().includes(q.toLowerCase())))
  const count = (s: string) => all.filter(c => c.status === s).length
  const types = [...new Set(all.map(c => c.type))]

  return <>
    <header><div><h1>Commits</h1>
      <p>{set ? `${set.repo} · actualizado ${when(set.syncedAt)}` : 'Historial de tus commits y en qué ambiente está cada uno'}</p></div>
      {!sharedDb && cfg.token && <button onClick={() => live()} disabled={busy}>{busy ? 'Cargando…' : 'Actualizar'}</button>}
    </header>

    {!sharedDb && !cfg.token && <TokenForm onSave={c => { write(c); setCfg(c); live(c) }} />}
    {err && <p className="notice">{err}{sharedDb ? ' Pídele a Claude «sincroniza mis commits» para cargarlos.' : ''}</p>}
    {busy && !set && <p className="empty">Cargando commits…</p>}

    {set && <>
      <div className="kpis kpis5">
        {STATES.map(s => <button key={s} className={`kpi ${st === s ? 'sel' : ''}`} onClick={() => setSt(st === s ? '' : s)}>
          <span>{STATUS_LABEL[s]}</span><b>{count(s)}</b></button>)}
      </div>
      <div className="filters">
        <input id="c-q" placeholder="Buscar por descripción, módulo o SHA…" value={q} onChange={e => setQ(e.target.value)} />
        <select id="c-type" value={ty} onChange={e => setTy(e.target.value)}>
          <option value="">Todos los tipos</option>{types.map(t => <option key={t} value={t}>{TYPES[t] ?? t}</option>)}
        </select>
        <select id="c-status" value={st} onChange={e => setSt(e.target.value)}>
          <option value="">Todos los estados</option>{STATES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </div>
      <div className="tablewrap"><table className="commits">
        <thead><tr><th>Fecha</th><th>De qué trata</th><th>Descripción</th><th>Autor</th><th>Estado</th><th>SHA</th></tr></thead>
        <tbody>{list.map(c => <tr key={c.sha} onClick={() => setOpen(open === c.sha ? null : c.sha)}>
          <td className="nowrap num">{when(c.date)}</td>
          <td><span className={`type t-${c.type}`}>{TYPES[c.type] ?? c.type}</span>{c.scope && <div className="scope">{c.scope}</div>}</td>
          <td className="desc"><div>{c.subject}</div>{c.body && <small className={open === c.sha ? '' : 'clamp'}>{c.body}</small>}</td>
          <td className="nowrap">{c.author}</td>
          <td><span className={`status s-${c.status}`} title={c.branches.length ? `En: ${c.branches.join(', ')}` : 'Aún no está en DEV, QA, main ni PROD'}>{STATUS_LABEL[c.status]}</span></td>
          <td className="num sha">{c.sha.slice(0, 7)}</td>
        </tr>)}</tbody>
      </table></div>
      {!list.length && <p className="empty">Ningún commit coincide con los filtros.</p>}
      <p className="hint">Mostrando {list.length} de {all.length}. Toca una fila para ver la descripción completa.</p>
    </>}
  </>
}

function TokenForm({ onSave }: { onSave: (c: { token: string; author: string }) => void }) {
  const [token, setToken] = useState(''), [author, setAuthor] = useState('hramirezcts')
  return <form className="tokenform" onSubmit={e => { e.preventDefault(); if (token.trim()) onSave({ token: token.trim(), author: author.trim() }) }}>
    <p>Para leer los commits de Core Plus (repositorio privado) crea un token de GitHub de <b>solo lectura</b> (Fine-grained, permiso <i>Contents: Read</i> sobre core-plus-vite) y pégalo aquí. Se guarda solo en este navegador.</p>
    <div className="inline">
      <input id="gh-token" type="password" placeholder="Token de GitHub" value={token} onChange={e => setToken(e.target.value)} />
      <input id="gh-author" placeholder="Usuario de GitHub" value={author} onChange={e => setAuthor(e.target.value)} />
      <button className="primary">Conectar</button>
    </div>
  </form>
}

/* ---- Tema: claro / oscuro / sistema ---- */
type Theme = 'system' | 'light' | 'dark'
const applyTheme = (t: Theme) => {
  if (t === 'system') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', t)
}
export function ThemeSwitch() {
  const [t, setT] = useState<Theme>(() => { try { return (localStorage.getItem('tm-theme') as Theme) || 'system' } catch { return 'system' } })
  useEffect(() => { applyTheme(t); try { localStorage.setItem('tm-theme', t) } catch { /* sin almacenamiento */ } }, [t])
  return <div className="themes" role="group" aria-label="Tema">
    {([['light', 'Claro'], ['dark', 'Oscuro'], ['system', 'Sistema']] as [Theme, string][]).map(([k, l]) =>
      <button key={k} className={t === k ? 'on' : ''} aria-pressed={t === k} onClick={() => setT(k)}>{l}</button>)}
  </div>
}

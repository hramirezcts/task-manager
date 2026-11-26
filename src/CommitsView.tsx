import { useEffect, useState } from 'react'
import { sharedDb, isAdmin } from './store'
import { ApplyAction } from './ApplyAction'
import { fetchLive, TYPES, ENVS, type CommitSet, type Commit } from './commits'

const LS = 'tm-github'
const read = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}') } catch { return {} } }
const write = (v: object) => { try { localStorage.setItem(LS, JSON.stringify(v)) } catch { /* sin almacenamiento */ } }
const STATUS_LABEL: Record<string, string> = { PROD: 'Producción', main: 'main', QA: 'QA', DEV: 'DEV', Rama: 'Solo en rama' }
const STATES = [...ENVS, 'Rama']
type SortKey = 'date' | 'name'
const modOf = (c: Commit) => c.module || (c.scope ? c.scope : 'Sin módulo')
const when = (d: string) => new Date(d).toLocaleString('es', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export function CommitsView() {
  const [set, setSet] = useState<CommitSet | null>(null)
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const [cfg, setCfg] = useState<{ token?: string; author?: string }>(read)
  const [q, setQ] = useState(''), [st, setSt] = useState(''), [ty, setTy] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [mod, setMod] = useState(''), [au, setAu] = useState(''), [pro, setPro] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' })
  const [picked, setPicked] = useState<Set<string>>(new Set()), [bulk, setBulk] = useState<'QA' | 'PROD' | null>(null)

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
    && (!mod || modOf(c) === mod) && (!pro || c.process === pro) && (!au || c.author === au)
    && (!q || (c.subject + c.body + c.scope + c.sha).toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => {
      const r = sort.key === 'name' ? a.subject.localeCompare(b.subject, 'es', { sensitivity: 'base' }) : a.date.localeCompare(b.date)
      return sort.dir === 'asc' ? r : -r
    })
  const count = (s: string) => all.filter(c => c.status === s).length
  const uniq = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b, 'es'))
  const types = uniq(all.map(c => c.type))
  const modules = set?.catalog?.length ? [...set.catalog.map(m => m.name), 'Sin módulo'] : uniq(all.map(modOf))
  const processes = mod ? (set?.catalog?.find(m => m.name === mod)?.processes ?? uniq(all.filter(c => modOf(c) === mod).map(c => c.process || ''))).concat('General').filter((x, i, a) => x && a.indexOf(x) === i) : []
  const countMod = (m: string) => all.filter(c => modOf(c) === m).length
  const authors = uniq(all.map(c => c.author))
  const sortBy = (key: SortKey) => setSort(s => ({ key, dir: s.key === key ? (s.dir === 'asc' ? 'desc' : 'asc') : key === 'date' ? 'desc' : 'asc' }))
  const arrow = (key: SortKey) => sort.key === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''
  const ariaSort = (key: SortKey) => sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'
  const anyFilter = q || st || ty || mod || au || pro
  const clear = () => { setQ(''); setSt(''); setTy(''); setMod(''); setAu(''); setPro('') }
  const sel = all.find(c => c.sha === open)
  const admin = isAdmin || !sharedDb
  const toggle = (sha: string) => setPicked(p => { const n = new Set(p); n.has(sha) ? n.delete(sha) : n.add(sha); return n })
  const allPicked = list.length > 0 && list.every(c => picked.has(c.sha))
  const toggleAll = () => setPicked(p => { const n = new Set(p); list.forEach(c => allPicked ? n.delete(c.sha) : n.add(c.sha)); return n })

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
        <select id="c-module" value={mod} onChange={e => { setMod(e.target.value); setPro('') }} aria-label="Módulo">
          <option value="">Todos los módulos</option>{modules.map(m => <option key={m} value={m}>{m} ({countMod(m)})</option>)}
        </select>
        <select id="c-process" value={pro} onChange={e => setPro(e.target.value)} aria-label="Proceso" disabled={!mod}>
          <option value="">{mod ? 'Todos los procesos' : 'Proceso (elige módulo)'}</option>
          {processes.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select id="c-author" value={au} onChange={e => setAu(e.target.value)} aria-label="Autor">
          <option value="">Todos los autores</option>{authors.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select id="c-status" value={st} onChange={e => setSt(e.target.value)} aria-label="Estado">
          <option value="">Todos los estados</option>{STATES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <select id="c-sort" value={`${sort.key}-${sort.dir}`} aria-label="Ordenar"
          onChange={e => { const [key, dir] = e.target.value.split('-') as [SortKey, 'asc' | 'desc']; setSort({ key, dir }) }}>
          <option value="date-desc">Más recientes primero</option><option value="date-asc">Más antiguos primero</option>
          <option value="name-asc">Nombre A → Z</option><option value="name-desc">Nombre Z → A</option>
        </select>
        {anyFilter && <button className="link" onClick={clear}>Limpiar filtros</button>}
      </div>
      {admin && picked.size > 0 && <div className="bulkbar">
        <span><b>{picked.size}</b> seleccionado(s)</span>
        <span className="inline">
          <button onClick={() => setBulk('QA')}>Aplicar en QA</button>
          <button className="prod" onClick={() => setBulk('PROD')}>Aplicar en Producción</button>
          <button className="link" onClick={() => setPicked(new Set())}>Quitar selección</button>
        </span>
      </div>}
      {bulk && <BulkModal env={bulk} repo={set.repo} commits={all.filter(c => picked.has(c.sha))} onClose={() => setBulk(null)} />}
      <div className="tablewrap"><table className="commits">
        <thead><tr>
          <th className="chk"><input type="checkbox" aria-label="Seleccionar todos los visibles" checked={allPicked} onChange={toggleAll} /></th>
          <th aria-sort={ariaSort('date')}><button className="th" onClick={() => sortBy('date')}>Fecha{arrow('date')}</button></th>
          <th>De qué trata</th>
          <th aria-sort={ariaSort('name')}><button className="th" onClick={() => sortBy('name')}>Descripción{arrow('name')}</button></th>
          <th>Autor</th><th>Estado</th><th>SHA</th></tr></thead>
        <tbody>{list.map(c => <tr key={c.sha} tabIndex={0} className={picked.has(c.sha) ? 'picked' : ''} onClick={() => setOpen(c.sha)} onKeyDown={e => e.key === 'Enter' && setOpen(c.sha)}>
          <td className="chk" onClick={e => e.stopPropagation()}><input type="checkbox" aria-label={`Seleccionar ${c.subject}`} checked={picked.has(c.sha)} onChange={() => toggle(c.sha)} /></td>
          <td className="nowrap num">{when(c.date)}</td>
          <td><div className="modcell">{modOf(c)}</div>{c.process && c.process !== 'General' && <div className="scope">{c.process}</div>}<span className={`type t-${c.type}`}>{TYPES[c.type] ?? c.type}</span></td>
          <td className="desc"><div>{c.subject}</div>{c.body && <small className="clamp">{c.body}</small>}</td>
          <td className="nowrap">{c.author}</td>
          <td><span className={`status s-${c.status}`} title={c.branches.length ? `En: ${c.branches.join(', ')}` : 'Aún no está en DEV, QA, main ni PROD'}>{STATUS_LABEL[c.status]}</span></td>
          <td className="num sha">{c.sha.slice(0, 7)}</td>
        </tr>)}</tbody>
      </table></div>
      {!list.length && <p className="empty">Ningún commit coincide con los filtros.</p>}
      {sel && <CommitModal c={sel} repo={set.repo} onClose={() => setOpen(null)} />}
      <p className="hint">Mostrando {list.length} de {all.length}. Toca una fila para ver el detalle completo.</p>
    </>}
  </>
}

function TokenForm({ onSave }: { onSave: (c: { token: string; author: string }) => void }) {
  const [token, setToken] = useState(''), [author, setAuthor] = useState('hramirezcts')
  return <form className="tokenform" onSubmit={e => { e.preventDefault(); if (token.trim()) onSave({ token: token.trim(), author: author.trim() }) }}>
    <p>Para leer los commits de Core Plus crea un token de GitHub Fine-grained sobre core-plus-vite con <i>Contents: Read</i>. Si eres administrador y quieres aplicar o reversar desde aquí, agrega <i>Actions: Read and write</i>. Pégalo aquí; Se guarda solo en este navegador.</p>
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

/* ---- Detalle del commit ---- */
const PIPE = ['DEV', 'QA', 'main', 'PROD'] as const
function CommitModal({ c, repo, onClose }: { c: Commit; repo: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [onClose])
  const copy = () => navigator.clipboard?.writeText(c.sha).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {})
  const url = `https://github.com/${repo}/commit/${c.sha}`
  const [deploy, setDeploy] = useState(false)
  const [revert, setRevert] = useState(false), [revEnv, setRevEnv] = useState(c.branches[0] ?? 'DEV')
  const admin = isAdmin || !sharedDb
  const revCmds = `git fetch origin
git switch ${revEnv}
git pull --ff-only origin ${revEnv}
git revert --no-edit ${c.sha}
git push origin ${revEnv}`
  const cmds = `git fetch origin\ngit switch PROD\ngit pull --ff-only origin PROD\ngit cherry-pick ${c.sha}\ngit push origin PROD`
  return <div className="overlay" onClick={onClose}>
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="cm-title" onClick={e => e.stopPropagation()}>
      <div className="m-head">
        <div>
          <div className="m-eyebrow"><span className={`type t-${c.type}`}>{TYPES[c.type] ?? c.type}</span> · {modOf(c)}{c.process && c.process !== 'General' && <> › {c.process}</>}</div>
          <h2 id="cm-title">{c.subject}</h2>
        </div>
        <button className="icon" aria-label="Cerrar" onClick={onClose}>×</button>
      </div>

      <dl className="m-grid">
        <div><dt>Estado</dt><dd><span className={`status s-${c.status}`}>{STATUS_LABEL[c.status]}</span></dd></div>
        <div><dt>Autor</dt><dd>{c.author}</dd></div>
        <div><dt>Fecha</dt><dd className="num">{when(c.date)}</dd></div>
        <div><dt>Commit</dt><dd className="sha-row"><code>{c.sha.slice(0, 10)}</code><button className="link" onClick={copy}>{copied ? 'Copiado' : 'Copiar SHA'}</button></dd></div>
      </dl>

      <section className="m-sec">
        <h3>Recorrido por ambientes</h3>
        <ol className="pipe">{PIPE.map(e => {
          const on = c.branches.includes(e)
          return <li key={e} className={on ? 'on' : ''}><span className="dotp" />{STATUS_LABEL[e]}<small>{on ? 'Incluido' : 'No incluido'}</small></li>
        })}</ol>
        {!c.branches.length && <p className="hint">Este cambio todavía está solo en su rama de trabajo.</p>}
      </section>

      <section className="m-sec">
        <h3>Descripción del cambio</h3>
        {c.body ? <p className="m-body">{c.body}</p> : <p className="hint">El commit no tiene descripción adicional.</p>}
      </section>

      {deploy && <section className="m-sec deploy">
        <h3>Pasar a producción</h3>
        <p className="hint">Aplica solo este commit sobre la rama PROD. Si hay conflicto, se cancela sin publicar nada. <a href={`https://github.com/${repo}/compare/PROD...${c.sha}`} target="_blank" rel="noopener noreferrer">Comparar con PROD</a></p>
        <ApplyAction repo={repo} env="PROD" op="aplicar" shas={[c.sha]} commands={cmds} />
        <button className="link" onClick={() => setDeploy(false)}>Cancelar</button>
      </section>}

      {revert && <section className="m-sec deploy danger-box">
        <h3>Reversar cambio</h3>
        <p className="hint">Crea un commit nuevo que deshace este cambio en el ambiente elegido. No borra historial.</p>
        <label className="inline">Ambiente
          <select id="rev-env" value={revEnv} onChange={e => setRevEnv(e.target.value)}>{c.branches.map(b => <option key={b} value={b}>{STATUS_LABEL[b]}</option>)}</select>
        </label>
        <ApplyAction key={revEnv} repo={repo} env={revEnv} op="reversar" shas={[c.sha]} commands={revCmds} />
        <button className="link" onClick={() => setRevert(false)}>Cancelar</button>
      </section>}

      <div className="m-foot">
        <a href={url} target="_blank" rel="noopener noreferrer">Ver en GitHub</a>
        <span className="inline">
          {admin && c.branches.length > 0 && !revert && <button className="danger" onClick={() => { setRevert(true); setDeploy(false) }}>Reversar</button>}
          {admin && c.status !== 'PROD' && !deploy && <button className="prod" onClick={() => { setDeploy(true); setRevert(false) }}>Pasar a producción</button>}
          <button className={c.status === 'PROD' ? 'primary' : ''} onClick={onClose}>Cerrar</button>
        </span>
      </div>
    </div>
  </div>
}

/* ---- Aplicación masiva a QA o Producción ---- */
function BulkModal({ env, repo, commits, onClose }: { env: 'QA' | 'PROD'; repo: string; commits: Commit[]; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [onClose])
  const ordered = [...commits].sort((a, b) => a.date.localeCompare(b.date))
  const already = ordered.filter(c => c.branches.includes(env))
  const todo = ordered.filter(c => !c.branches.includes(env))
  const label = STATUS_LABEL[env]
  const cmds = ['git fetch origin', `git switch ${env}`, `git pull --ff-only origin ${env}`,
    `git cherry-pick ${todo.map(c => c.sha).join(' ')}`, `git push origin ${env}`].join('\n')
  return <div className="overlay" onClick={onClose}>
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="bm-title" onClick={e => e.stopPropagation()}>
      <div className="m-head">
        <div><div className="m-eyebrow">Aplicación masiva</div><h2 id="bm-title">Aplicar {todo.length} commit(s) en {label}</h2></div>
        <button className="icon" aria-label="Cerrar" onClick={onClose}>×</button>
      </div>
      <section className="m-sec">
        <h3>Se aplicarán en este orden (del más antiguo al más reciente)</h3>
        {todo.length ? <ol className="bulklist">{todo.map(c => <li key={c.sha}>
          <code>{c.sha.slice(0, 7)}</code><span>{c.subject}</span><small>{modOf(c)} · {when(c.date)}</small></li>)}</ol>
          : <p className="hint">Todos los seleccionados ya están en {label}.</p>}
        {already.length > 0 && <p className="hint">{already.length} seleccionado(s) ya están en {label} y se omiten.</p>}
      </section>
      {todo.length > 0 && <section className="m-sec deploy">
        <h3>Aplicar</h3>
        <p className="hint">Se aplican en ese orden. Si alguno tiene conflicto, se cancela todo y no se publica nada.</p>
        <ApplyAction repo={repo} env={env} op="aplicar" shas={todo.map(c => c.sha)} commands={cmds} />
      </section>}
      <div className="m-foot">
        <span />
        <button onClick={onClose}>Cerrar</button>
      </div>
    </div>
  </div>
}

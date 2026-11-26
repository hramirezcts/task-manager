import { useEffect, useState } from 'react'
import { CommitsView, ThemeSwitch } from './CommitsView'
import { useData, uid, today, type Data, type Task, type Note, type Process, type Priority, type Status } from './store'

type View = 'dia' | 'tareas' | 'notas' | 'procesos' | 'commits'
type Up = (fn: (d: Data) => Data) => void
const VIEWS: [View, string][] = [['dia', 'Mi día'], ['tareas', 'Tareas'], ['notas', 'Notas'], ['procesos', 'Procesos'], ['commits', 'Commits']]
const fmt = (d: string) => d ? new Date(d + 'T00:00').toLocaleDateString('es', { day: '2-digit', month: 'short' }) : ''

export default function App() {
  const { data, mode, update, replace } = useData()
  const fromHash = () => { const h = location.hash.slice(1) as View; return VIEWS.some(([k]) => k === h) ? h : 'dia' }
  const [view, setViewState] = useState<View>(fromHash)
  const setView = (v: View) => { setViewState(v); if (location.hash !== '#' + v) history.replaceState(null, '', '#' + v) }
  useEffect(() => { const on = () => setViewState(fromHash()); addEventListener('hashchange', on); return () => removeEventListener('hashchange', on) }, [])
  const [pending, setPending] = useState<Data | null>(null)
  if (!data) return <div className="loading">Cargando tus tareas…</div>
  const open = data.tasks.filter(t => t.status !== 'hecha').length

  const exportar = async () => {
    const json = JSON.stringify(data, null, 2), filename = `respaldo-tareas-${today()}.json`
    const dl = await window.claude?.use('downloads').catch(() => null)
    if (dl) return dl.save({ filename, data: json }).catch(() => {})
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = filename; a.click()
  }
  const importar = (f?: File) => f?.text().then(t => { try { setPending(JSON.parse(t)) } catch { /* archivo inválido */ } })

  return (
    <div className="app">
      <aside>
        <div className="brand">Task Manager</div>
        <nav>{VIEWS.map(([k, l]) =>
          <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>
            {l}{k === 'tareas' && open > 0 && <span className="count">{open}</span>}
          </button>)}
        </nav>
        <div className="foot">
          <ThemeSwitch />
          <button className="link" onClick={exportar}>Exportar respaldo</button>
          <label className="link">Importar respaldo
            <input type="file" accept=".json" hidden onChange={e => importar(e.target.files?.[0])} /></label>
          {pending && <div className="confirmbox">Reemplazar todos los datos con el respaldo?
            <span><button className="danger" onClick={() => { replace(pending); setPending(null) }}>Reemplazar</button>
            <button onClick={() => setPending(null)}>Cancelar</button></span></div>}
          <small>v{__APP_VERSION__} · {mode === 'nube' ? 'guardado en tu cuenta' : mode === 'local' ? 'guardado en este equipo' : 'sin guardado: exporta un respaldo'}</small>
        </div>
      </aside>
      <main>
        {view === 'dia' && <Day data={data} update={update} />}
        {view === 'tareas' && <Tasks data={data} update={update} />}
        {view === 'notas' && <Notes data={data} update={update} />}
        {view === 'procesos' && <Processes data={data} update={update} />}
        {view === 'commits' && <CommitsView />}
      </main>
    </div>
  )
}

/* ---------- Mi día ---------- */
function Day({ data, update }: { data: Data; update: Up }) {
  const t = today()
  const entry = data.journal.find(j => j.date === t)?.text ?? ''
  const overdue = data.tasks.filter(x => x.status !== 'hecha' && x.due && x.due < t)
  const due = data.tasks.filter(x => x.status !== 'hecha' && x.due === t)
  const doing = data.tasks.filter(x => x.status === 'en curso' && x.due !== t && !(x.due && x.due < t))
  const doneToday = data.tasks.filter(x => x.doneAt?.startsWith(t))
  const setEntry = (text: string) => update(d => ({
    ...d, journal: [...d.journal.filter(j => j.date !== t), { date: t, text }]
  }))
  const pastEntries = data.journal.filter(j => j.date !== t && j.text.trim()).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7)

  return <>
    <Header title="Mi día" sub={new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })} />
    <div className="kpis">
      <Kpi label="Vencidas" value={overdue.length} warn={overdue.length > 0} />
      <Kpi label="Para hoy" value={due.length} />
      <Kpi label="En curso" value={doing.length} />
      <Kpi label="Completadas hoy" value={doneToday.length} />
    </div>
    <QuickAdd update={update} defaultDue={t} />
    {overdue.length > 0 && <Section title="Vencidas"><TaskList tasks={overdue} data={data} update={update} /></Section>}
    <Section title="Para hoy"><TaskList tasks={due} data={data} update={update} empty="Nada programado para hoy." /></Section>
    {doing.length > 0 && <Section title="En curso"><TaskList tasks={doing} data={data} update={update} /></Section>}
    <Section title="Bitácora del día">
      <textarea className="journal" placeholder="¿Qué pasó hoy? Avances, bloqueos, decisiones…" value={entry} onChange={e => setEntry(e.target.value)} />
    </Section>
    {pastEntries.length > 0 && <Section title="Días anteriores">
      {pastEntries.map(j => <div key={j.date} className="past"><b>{fmt(j.date)}</b><p>{j.text}</p></div>)}
    </Section>}
  </>
}

/* ---------- Tareas ---------- */
function Tasks({ data, update }: { data: Data; update: Up }) {
  const [status, setStatus] = useState<Status | 'abiertas' | 'todas'>('abiertas')
  const [proc, setProc] = useState('')
  const [q, setQ] = useState('')
  const rank = { alta: 0, media: 1, baja: 2 }
  const list = data.tasks
    .filter(t => status === 'todas' || (status === 'abiertas' ? t.status !== 'hecha' : t.status === status))
    .filter(t => !proc || t.processId === proc)
    .filter(t => !q || (t.title + t.detail).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => rank[a.priority] - rank[b.priority] || (a.due || '9').localeCompare(b.due || '9'))
  return <>
    <Header title="Tareas" sub={`${list.length} resultado(s)`} />
    <QuickAdd update={update} processes={data.processes} />
    <div className="filters">
      <input placeholder="Buscar…" value={q} onChange={e => setQ(e.target.value)} />
      <select value={status} onChange={e => setStatus(e.target.value as never)}>
        <option value="abiertas">Abiertas</option><option value="pendiente">Pendientes</option>
        <option value="en curso">En curso</option><option value="hecha">Hechas</option><option value="todas">Todas</option>
      </select>
      <select value={proc} onChange={e => setProc(e.target.value)}>
        <option value="">Todos los procesos</option>
        {data.processes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </div>
    <TaskList tasks={list} data={data} update={update} empty="No hay tareas con estos filtros." />
  </>
}

function QuickAdd({ update, defaultDue = '', processes = [] }: { update: Up; defaultDue?: string; processes?: Process[] }) {
  const [title, setTitle] = useState(''), [due, setDue] = useState(defaultDue)
  const [priority, setPriority] = useState<Priority>('media'), [processId, setProcessId] = useState('')
  const add = () => {
    if (!title.trim()) return
    const t: Task = { id: uid(), title: title.trim(), detail: '', status: 'pendiente', priority, due, processId, createdAt: new Date().toISOString() }
    update(d => ({ ...d, tasks: [t, ...d.tasks] })); setTitle('')
  }
  return <form className="quick" onSubmit={e => { e.preventDefault(); add() }}>
    <input placeholder="Nueva tarea y Enter…" value={title} onChange={e => setTitle(e.target.value)} />
    <select value={priority} onChange={e => setPriority(e.target.value as Priority)}>
      <option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option>
    </select>
    <input type="date" value={due} onChange={e => setDue(e.target.value)} />
    {processes.length > 0 && <select value={processId} onChange={e => setProcessId(e.target.value)}>
      <option value="">Sin proceso</option>{processes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>}
    <button className="primary">Agregar</button>
  </form>
}

function TaskList({ tasks, data, update, empty }: { tasks: Task[]; data: Data; update: Up; empty?: string }) {
  const [openId, setOpenId] = useState<string | null>(null)
  if (!tasks.length) return <p className="empty">{empty ?? 'Sin tareas.'}</p>
  const set = (id: string, p: Partial<Task>) => update(d => ({ ...d, tasks: d.tasks.map(t => t.id === id ? { ...t, ...p } : t) }))
  const toggle = (t: Task) => set(t.id, t.status === 'hecha' ? { status: 'pendiente', doneAt: undefined } : { status: 'hecha', doneAt: new Date().toISOString() })
  const t0 = today()
  return <ul className="tasks">{tasks.map(t => {
    const p = data.processes.find(x => x.id === t.processId)
    return <li key={t.id} className={t.status === 'hecha' ? 'done' : ''}>
      <div className="row">
        <input type="checkbox" checked={t.status === 'hecha'} onChange={() => toggle(t)} />
        <span className={`dot ${t.priority}`} title={`Prioridad ${t.priority}`} />
        <button className="title" onClick={() => setOpenId(openId === t.id ? null : t.id)}>{t.title}</button>
        {t.status === 'en curso' && <span className="tag">En curso</span>}
        {p && <span className="tag">{p.name}</span>}
        {t.due && <span className={`due ${t.status !== 'hecha' && t.due < t0 ? 'late' : ''}`}>{fmt(t.due)}</span>}
      </div>
      {openId === t.id && <div className="edit">
        <input value={t.title} onChange={e => set(t.id, { title: e.target.value })} />
        <textarea placeholder="Detalle…" value={t.detail} onChange={e => set(t.id, { detail: e.target.value })} />
        <div className="inline">
          <select value={t.status} onChange={e => set(t.id, { status: e.target.value as Status, doneAt: e.target.value === 'hecha' ? new Date().toISOString() : undefined })}>
            <option value="pendiente">Pendiente</option><option value="en curso">En curso</option><option value="hecha">Hecha</option>
          </select>
          <select value={t.priority} onChange={e => set(t.id, { priority: e.target.value as Priority })}>
            <option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option>
          </select>
          <input type="date" value={t.due} onChange={e => set(t.id, { due: e.target.value })} />
          <select value={t.processId} onChange={e => set(t.id, { processId: e.target.value })}>
            <option value="">Sin proceso</option>{data.processes.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <Confirm label="Eliminar" onYes={() => update(d => ({ ...d, tasks: d.tasks.filter(x => x.id !== t.id) }))} />
        </div>
        {p && p.policies.filter(x => x.active).length > 0 && <div className="policies-hint">
          <b>Políticas aplicables ({p.name})</b>
          <ul>{p.policies.filter(x => x.active).map(x => <li key={x.id}><b>{x.title}:</b> {x.rule}</li>)}</ul>
        </div>}
      </div>}
    </li>
  })}</ul>
}

/* ---------- Notas ---------- */
function Notes({ data, update }: { data: Data; update: Up }) {
  const [sel, setSel] = useState<string | null>(data.notes[0]?.id ?? null)
  const [q, setQ] = useState('')
  const notes = [...data.notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .filter(n => !q || (n.title + n.body + n.tags).toLowerCase().includes(q.toLowerCase()))
  const note = data.notes.find(n => n.id === sel)
  const set = (p: Partial<Note>) => update(d => ({ ...d, notes: d.notes.map(n => n.id === sel ? { ...n, ...p, updatedAt: new Date().toISOString() } : n) }))
  const add = () => { const n: Note = { id: uid(), title: 'Nueva nota', body: '', tags: '', updatedAt: new Date().toISOString() }; update(d => ({ ...d, notes: [n, ...d.notes] })); setSel(n.id) }
  return <>
    <Header title="Notas" action={<button className="primary" onClick={add}>Nueva nota</button>} />
    <div className="split">
      <div className="list">
        <input placeholder="Buscar notas…" value={q} onChange={e => setQ(e.target.value)} />
        {notes.map(n => <button key={n.id} className={n.id === sel ? 'on' : ''} onClick={() => setSel(n.id)}>
          <b>{n.title || 'Sin título'}</b><small>{new Date(n.updatedAt).toLocaleDateString('es')}{n.tags && ` · ${n.tags}`}</small>
        </button>)}
        {!notes.length && <p className="empty">Sin notas.</p>}
      </div>
      {note ? <div className="editor">
        <input className="big" value={note.title} onChange={e => set({ title: e.target.value })} />
        <input placeholder="Etiquetas (separadas por coma)" value={note.tags} onChange={e => set({ tags: e.target.value })} />
        <textarea value={note.body} placeholder="Escribe…" onChange={e => set({ body: e.target.value })} />
        <Confirm label="Eliminar nota" onYes={() => { update(d => ({ ...d, notes: d.notes.filter(n => n.id !== sel) })); setSel(null) }} />
      </div> : <p className="empty">Selecciona o crea una nota.</p>}
    </div>
  </>
}

/* ---------- Procesos y políticas ---------- */
function Processes({ data, update }: { data: Data; update: Up }) {
  const [sel, setSel] = useState<string | null>(data.processes[0]?.id ?? null)
  const p = data.processes.find(x => x.id === sel)
  const set = (patch: Partial<Process>) => update(d => ({ ...d, processes: d.processes.map(x => x.id === sel ? { ...x, ...patch } : x) }))
  const add = () => { const n: Process = { id: uid(), name: 'Nuevo proceso', description: '', owner: '', steps: [], policies: [] }; update(d => ({ ...d, processes: [...d.processes, n] })); setSel(n.id) }
  const tasksOf = (id: string) => data.tasks.filter(t => t.processId === id)
  return <>
    <Header title="Procesos" sub="Define pasos y asigna políticas a cada proceso" action={<button className="primary" onClick={add}>Nuevo proceso</button>} />
    <div className="split">
      <div className="list">
        {data.processes.map(x => {
          const open = tasksOf(x.id).filter(t => t.status !== 'hecha').length
          return <button key={x.id} className={x.id === sel ? 'on' : ''} onClick={() => setSel(x.id)}>
            <b>{x.name}</b><small>{x.policies.filter(y => y.active).length} política(s) · {open} tarea(s) abiertas</small>
          </button>
        })}
        {!data.processes.length && <p className="empty">Sin procesos.</p>}
      </div>
      {p ? <div className="editor">
        <input className="big" value={p.name} onChange={e => set({ name: e.target.value })} />
        <input placeholder="Responsable" value={p.owner} onChange={e => set({ owner: e.target.value })} />
        <textarea className="short" placeholder="Descripción / objetivo del proceso" value={p.description} onChange={e => set({ description: e.target.value })} />

        <h3>Pasos</h3>
        <ol className="steps">{p.steps.map((s, i) => <li key={i}>
          <input value={s} onChange={e => set({ steps: p.steps.map((x, j) => j === i ? e.target.value : x) })} />
          <button className="icon" onClick={() => set({ steps: p.steps.filter((_, j) => j !== i) })}>×</button>
        </li>)}</ol>
        <button className="ghost" onClick={() => set({ steps: [...p.steps, ''] })}>+ Agregar paso</button>

        <h3>Políticas</h3>
        {p.policies.map(pol => {
          const sp = (patch: Partial<typeof pol>) => set({ policies: p.policies.map(x => x.id === pol.id ? { ...x, ...patch } : x) })
          return <div key={pol.id} className={`policy ${pol.active ? '' : 'off'}`}>
            <div className="inline">
              <input placeholder="Nombre de la política" value={pol.title} onChange={e => sp({ title: e.target.value })} />
              <label className="switch"><input type="checkbox" checked={pol.active} onChange={e => sp({ active: e.target.checked })} /> Activa</label>
              <button className="icon" onClick={() => set({ policies: p.policies.filter(x => x.id !== pol.id) })}>×</button>
            </div>
            <textarea className="short" placeholder="Regla: qué se debe cumplir, límites, aprobaciones…" value={pol.rule} onChange={e => sp({ rule: e.target.value })} />
          </div>
        })}
        <button className="ghost" onClick={() => set({ policies: [...p.policies, { id: uid(), title: '', rule: '', active: true }] })}>+ Asignar política</button>

        <h3>Tareas del proceso</h3>
        <TaskList tasks={tasksOf(p.id)} data={data} update={update} empty="Sin tareas vinculadas." />
        <Confirm label="Eliminar proceso" onYes={() => { update(d => ({ ...d, processes: d.processes.filter(x => x.id !== sel), tasks: d.tasks.map(t => t.processId === sel ? { ...t, processId: '' } : t) })); setSel(null) }} />
      </div> : <p className="empty">Selecciona o crea un proceso.</p>}
    </div>
  </>
}

/* ---------- UI ---------- */
const Header = ({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) =>
  <header><div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>{action}</header>
const Kpi = ({ label, value, warn }: { label: string; value: number; warn?: boolean }) =>
  <div className={`kpi ${warn ? 'warn' : ''}`}><span>{label}</span><b>{value}</b></div>
const Section = ({ title, children }: { title: string; children: React.ReactNode }) =>
  <section><h2>{title}</h2>{children}</section>

function Confirm({ label, onYes }: { label: string; onYes: () => void }) {
  const [ask, setAsk] = useState(false)
  return ask
    ? <span className="inline"><button className="danger" onClick={onYes}>Confirmar</button><button onClick={() => setAsk(false)}>Cancelar</button></span>
    : <button className="danger" onClick={() => setAsk(true)}>{label}</button>
}

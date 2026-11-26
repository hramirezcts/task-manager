import { useEffect, useState } from 'react'

export type Priority = 'alta' | 'media' | 'baja'
export type Status = 'pendiente' | 'en curso' | 'hecha'

export interface Task {
  id: string; title: string; detail: string; status: Status; priority: Priority
  due: string; processId: string; createdAt: string; doneAt?: string
}
export interface Note { id: string; title: string; body: string; tags: string; updatedAt: string }
export interface Policy { id: string; title: string; rule: string; active: boolean }
export interface Process {
  id: string; name: string; description: string; owner: string
  steps: string[]; policies: Policy[]
}
export interface Journal { date: string; text: string }
export interface Data { tasks: Task[]; notes: Note[]; processes: Process[]; journal: Journal[] }

const empty: Data = { tasks: [], notes: [], processes: [], journal: [] }
const DB = 'task-manager', STORE = 'kv', KEY = 'data'

function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
  })
}
async function load(): Promise<Data> {
  const d = await db()
  return new Promise(res => {
    const q = d.transaction(STORE).objectStore(STORE).get(KEY)
    q.onsuccess = () => res({ ...empty, ...(q.result ?? {}) }); q.onerror = () => res(empty)
  })
}
async function save(data: Data) {
  const d = await db()
  d.transaction(STORE, 'readwrite').objectStore(STORE).put(data, KEY)
}

export const uid = () => crypto.randomUUID()
export const today = () => new Date().toLocaleDateString('en-CA')

export let sharedDb: any = null

/* ---- Backend en claude.ai (Artifact): un documento privado por registro ---- */
type Rec = Record<string, unknown>
interface Remote { put(k: string, v: Rec): void; del(k: string): void }
declare global { interface Window { claude?: { use(n: string): Promise<any> } } }

async function remote(): Promise<{ data: Data; api: Remote } | null> {
  const c = window.claude; if (!c?.use) return null
  const timeout = new Promise<null>(r => setTimeout(() => r(null), 10000))
  const [db, user] = await Promise.race([Promise.all([c.use('db'), c.use('user')]), timeout.then(() => [null, null])]) as any[]
  if (!db || !user) return null
  sharedDb = db
  const col = db.collection('data/users/' + (await user.id()))
  const snap = await col.get()
  const data: Data = { tasks: [], notes: [], processes: [], journal: [] }
  for (const d of snap.docs) {
    const v = d.data() as any; if (!v) continue
    if (v.kind === 'task') data.tasks.push(v.item); else if (v.kind === 'note') data.notes.push(v.item)
    else if (v.kind === 'process') data.processes.push(v.item); else if (v.kind === 'journal') data.journal.push(v.item)
  }
  data.tasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  // Escrituras con debounce y en serie por documento
  const timers: Record<string, any> = {}, chain: Record<string, Promise<unknown>> = {}
  const queue = (k: string, op: () => Promise<unknown>, wait: number) => {
    clearTimeout(timers[k])
    timers[k] = setTimeout(() => { chain[k] = (chain[k] ?? Promise.resolve()).then(op).catch(e => console.error('db', k, e)) }, wait)
  }
  return { data, api: {
    put: (k, v) => queue(k, () => col.doc(k).set(v), 700),
    del: k => queue(k, () => col.doc(k).delete(), 0),
  } }
}

const KINDS = [['tasks', 'task', 'id'], ['notes', 'note', 'id'], ['processes', 'process', 'id'], ['journal', 'journal', 'date']] as const
function sync(api: Remote, prev: Data, next: Data) {
  for (const [field, kind, key] of KINDS) {
    const a = prev[field] as any[], b = next[field] as any[]
    const before = new Map(a.map(x => [x[key], x]))
    for (const x of b) if (before.get(x[key]) !== x) api.put(`${kind}_${x[key]}`, { kind, item: JSON.parse(JSON.stringify(x)) })
    const now = new Set(b.map(x => x[key]))
    for (const x of a) if (!now.has(x[key])) api.del(`${kind}_${x[key]}`)
  }
}

let api: Remote | null = null
export function useData() {
  const [data, setData] = useState<Data | null>(null)
  const [mode, setMode] = useState<'nube' | 'local' | 'memoria'>('local')
  useEffect(() => {
    const within = <T,>(p: Promise<T>, ms: number) =>
      Promise.race([p, new Promise<null>(r => setTimeout(() => r(null), ms))]).catch(() => null)
    ;(async () => {
      // claude.ai puede exponer window.claude un poco después del primer render
      const inArtifact = location.hostname.endsWith('claudeusercontent.com') || location.hostname.includes('claude')
      for (let i = 0; i < 30 && !window.claude && inArtifact; i++) await new Promise(r => setTimeout(r, 100))
      const r = await within(remote(), 12000)
      if (r) { api = r.api; setMode('nube'); setData(r.data); return }
      const l = await within(load(), 3000)
      if (l) { setData(l); return }
      setMode('memoria'); setData({ ...empty })
    })()
  }, [])
  const update = (fn: (d: Data) => Data) =>
    setData(prev => {
      if (!prev) return prev
      const next = fn(prev)
      if (api) sync(api, prev, next); else save(next).catch(() => {})
      return next
    })
  return { data, mode, update, replace: (d: Data) => update(() => ({ ...empty, ...d })) }
}

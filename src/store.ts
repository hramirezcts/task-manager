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

export function useData() {
  const [data, setData] = useState<Data | null>(null)
  useEffect(() => { load().then(setData) }, [])
  const update = (fn: (d: Data) => Data) =>
    setData(prev => { if (!prev) return prev; const next = fn(prev); save(next); return next })
  return { data, update, replace: (d: Data) => update(() => ({ ...empty, ...d })) }
}

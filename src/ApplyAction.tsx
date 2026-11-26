import { useEffect, useRef, useState } from 'react'
import { sharedDb } from './store'
import { dispatchApply, latestRun, WORKFLOW, type Op, type Run } from './commits'

const tokenOf = (): string => { try { return JSON.parse(localStorage.getItem('tm-github') || '{}').token || '' } catch { return '' } }
const ENV_LABEL: Record<string, string> = { PROD: 'Producción', main: 'main', QA: 'QA', DEV: 'DEV' }

/** Botón que aplica o reversa commits directamente mediante la GitHub Action. */
export function ApplyAction({ repo, env, op, shas, commands }: { repo: string; env: string; op: Op; shas: string[]; commands: string }) {
  const token = tokenOf()
  const direct = !!token && !sharedDb
  const [ask, setAsk] = useState(false), [err, setErr] = useState(''), [run, setRun] = useState<Run | null>(null), [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const timer = useRef<number>()
  useEffect(() => () => window.clearInterval(timer.current), [])
  const verb = op === 'reversar' ? 'Reversar' : 'Aplicar'
  const label = ENV_LABEL[env] ?? env
  const wfUrl = `https://github.com/${repo}/actions/workflows/${WORKFLOW}`

  const go = async () => {
    setAsk(false); setErr(''); setBusy(true); setRun(null)
    try {
      const since = await dispatchApply(token, repo, env, op, shas)
      let tries = 0
      timer.current = window.setInterval(async () => {
        tries++
        const r = await latestRun(token, repo, since).catch(() => null)
        if (r) setRun(r)
        if ((r && r.status === 'completed') || tries > 90) { window.clearInterval(timer.current); setBusy(false) }
      }, 4000)
    } catch (e) { setErr((e as Error).message); setBusy(false) }
  }
  const copySHAs = () => navigator.clipboard?.writeText(shas.join(' ')).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {})

  const state = run?.status === 'completed'
    ? (run.conclusion === 'success' ? { cls: 'ok', txt: `Listo: ${shas.length} commit(s) ${op === 'reversar' ? 'reversado(s)' : 'aplicado(s)'} en ${label}. Se verá en la tabla en la próxima sincronización.` }
      : { cls: 'bad', txt: 'La Action terminó con error (por ejemplo, un conflicto). No se publicó nada. Revisa el detalle en GitHub.' })
    : busy ? { cls: 'run', txt: run ? 'Ejecutándose en GitHub…' : 'Enviando a GitHub…' } : null

  return <div className="apply">
    {direct ? <>
      {!ask && !busy && !run && <button className={op === 'reversar' ? 'danger-solid' : env === 'PROD' ? 'prod' : 'primary'} onClick={() => setAsk(true)}>
        {verb} {shas.length > 1 ? `${shas.length} commits ` : ''}en {label}</button>}
      {ask && <div className="confirmrow">
        <span>¿{verb} {shas.length} commit(s) en <b>{label}</b>? Se publica de inmediato.</span>
        <button className={op === 'reversar' ? 'danger-solid' : 'prod'} onClick={go}>Sí, {verb.toLowerCase()}</button>
        <button onClick={() => setAsk(false)}>Cancelar</button>
      </div>}
    </> : <div className="confirmrow">
      <span>{sharedDb ? 'Desde claude.ai la página no puede llamar a GitHub. Abre la Action y pega los SHAs:' : 'Conecta un token de GitHub en este tab para aplicar directo. Mientras tanto:'}</span>
      <button onClick={copySHAs}>{copied ? 'SHAs copiados' : 'Copiar SHAs'}</button>
      <a className="btnlink" href={wfUrl} target="_blank" rel="noopener noreferrer">Abrir Action en GitHub</a>
    </div>}
    {state && <p className={`runstate ${state.cls}`} role="status">{state.txt} {run && <a href={run.html_url} target="_blank" rel="noopener noreferrer">Ver ejecución</a>}</p>}
    {err && <p className="runstate bad" role="alert">{err}</p>}
    <details className="manual"><summary>Hacerlo manualmente con git</summary><pre className="cmd">{commands}</pre></details>
  </div>
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './styles.css'

// Auto-actualización: busca nueva versión al abrir y cada hora; recarga sola al detectarla.
registerSW({ immediate: true, onRegisteredSW(_u, r) { r && setInterval(() => r.update(), 60 * 60 * 1000) } })
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)

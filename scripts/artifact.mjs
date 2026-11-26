// Convierte el HTML de un solo archivo al formato de página de Artifact (sin doctype/head/body).
import { readFileSync, writeFileSync } from 'fs'
const h = readFileSync('dist-artifact/index.html', 'utf8')
const styles = [...h.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map(m => m[0]).join('\n')
const scripts = [...h.matchAll(/<script[^>]*>[\s\S]*?<\/script>/g)].map(m => m[0]).join('\n')
writeFileSync('dist-artifact/task-manager.html',
  `<title>Task Manager</title>\n${styles}\n<div id="root"></div>\n${scripts}\n`)

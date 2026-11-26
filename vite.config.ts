import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/task-manager/',
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version) },
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['icon.svg'],
    manifest: {
      name: 'Task Manager', short_name: 'Tareas', lang: 'es',
      theme_color: '#111827', background_color: '#ffffff', display: 'standalone',
      icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }]
    }
  })]
})

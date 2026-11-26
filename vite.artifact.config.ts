import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { resolve } from 'path'

// Build de un solo HTML para publicar como Artifact de claude.ai (sin service worker).
export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version) },
  resolve: { alias: { 'virtual:pwa-register': resolve(__dirname, 'src/pwa-stub.ts') } },
  plugins: [react(), viteSingleFile()],
  build: { outDir: 'dist-artifact' },
})

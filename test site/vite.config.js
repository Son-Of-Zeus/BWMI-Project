import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const siteRoot = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(siteRoot, '..')
const extensionRoot = path.join(repositoryRoot, 'apps', 'extension')

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@voice-companion': extensionRoot,
    },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    fs: {
      allow: [repositoryRoot],
    },
  },
})

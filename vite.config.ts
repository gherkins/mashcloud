import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Deployed as a GitHub Pages *project* site under /mashcloud/ — served at
// https://datenkatze.de/mashcloud/ via the account's custom domain. The
// production build (and `preview`, so it mirrors prod) is prefixed with that
// subpath; the dev server stays at root.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/mashcloud/' : '/',
  plugins: [react()],
}))

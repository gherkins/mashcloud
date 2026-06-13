import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' keeps asset URLs relative so the same build works whether it is
// served from the domain root or from a GitHub Pages project subpath
// (https://<user>.github.io/mashcloud/).
export default defineConfig({
  base: './',
  plugins: [react()],
})

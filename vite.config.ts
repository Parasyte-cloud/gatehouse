import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the same production build works both at a
  // domain root (Cloudflare Pages) and loaded via file:// inside the
  // Electron desktop shell (see /desktop) - an absolute '/assets/...'
  // base breaks entirely under file://.
  base: './'
})

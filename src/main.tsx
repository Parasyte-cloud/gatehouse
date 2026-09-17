import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { applyStoredAppearance, installSystemThemeSync } from './lib/appearance'
import './gatehouse.css'

// Apply saved appearance before the first paint so sizing, glow and theme do
// not visibly jump after React mounts.
applyStoredAppearance()
installSystemThemeSync()

const root = document.getElementById('root')
if (!root) {
  throw new Error('Missing #root element')
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
)

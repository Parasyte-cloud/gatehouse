import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { applyStoredAppearance } from './lib/appearance'
import './gatehouse.css'

// Apply the saved browser size / glow before the first paint, so there's no
// flash of default appearance while React boots.
applyStoredAppearance()

const root = document.getElementById('root')
if (!root) {
  throw new Error('Missing #root element')
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
)

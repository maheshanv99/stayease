import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

// Capture invite/recovery token BEFORE React loads and clears the hash
const hash = window.location.hash
if (hash.includes('type=invite') || hash.includes('type=recovery') || 
    hash.includes('access_token') || hash === '#invite') {
  sessionStorage.setItem('auth_redirect', hash || '#invite')
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Suspense fallback={
      <div style={{ display: 'flex', width: '100vw', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#fff', fontSize: '1.2rem' }}>
        Loading...
      </div>
    }>
      <App />
    </Suspense>
  </StrictMode>,
)

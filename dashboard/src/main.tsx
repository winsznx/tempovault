import React from 'react'
import ReactDOM from 'react-dom/client'
import { PrivyProvider } from './providers/PrivyProvider'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PrivyProvider>
      <App />
    </PrivyProvider>
  </React.StrictMode>,
)

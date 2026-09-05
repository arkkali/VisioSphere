import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { startBrowserSessionGuard } from './utils/browserSession'
import { primeStreamToken } from './hooks/useStreamToken'

const render = () => createRoot(document.getElementById('root')).render(<App />)

/**
 * Decide whether this page load continues a running browser or is the first
 * load after a restart BEFORE anything renders, so a protected page is never
 * painted with a token that is about to be discarded. The check is instant on a
 * normal reload; only the ambiguous case waits, and only for a few hundred ms.
 *
 * The catch is not decoration: a storage failure inside the guard must never be
 * the reason the app shows a blank page.
 */
startBrowserSessionGuard()
  .catch(() => {})
  .finally(() => {
    // After the guard, never before: priming with a token the guard is about to
    // discard would fire a request on behalf of a session that is ending.
    // A no-op unless this load is a monitoring route with a live session.
    primeStreamToken();
    render();
  })

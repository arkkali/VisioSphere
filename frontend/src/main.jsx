import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { startBrowserSessionGuard, sessionLooksContinuous } from './utils/browserSession'
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
// When the heartbeat proves this load continues a running browser, the guard
// cannot clear the session — so there is nothing to wait for, and the stream
// token request should not sit behind the guard's ping window (up to 300 ms of
// dead time on the one page whose Largest Contentful Paint is a camera feed).
// Both calls are no-ops unless this load is a monitoring route with a live
// session, and primeStreamToken() itself is a no-op when a still-valid token is
// already cached — the common case, which needs no request at all.
if (sessionLooksContinuous()) primeStreamToken();

startBrowserSessionGuard()
  .catch(() => {})
  .finally(() => {
    // The ambiguous case only: priming a session the guard was still deciding
    // about would fire a request on behalf of one that is ending.
    primeStreamToken();
    render();
  })

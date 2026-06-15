// Brevis SPA entry: mount Root inside ErrorBoundary. The former 1,674-line
// single module is split across src/ (step B of the 2026-06 migration);
// mount logic below is verbatim from the original inline script.
import * as ReactDOM from 'react-dom/client';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { Root } from './components/Root.jsx';
import { installAuthRefresh } from './auth-refresh.js';
import './styles.css';

        // Transparent silent re-auth on 401 via the rotating refresh token.
        installAuthRefresh();

        const rootEl = document.getElementById('app');
        if (!rootEl) {
            document.body.innerHTML = '<div style="padding:40px;font-family:sans-serif">Mount point #app missing.</div>';
        } else {
            try {
                const root = ReactDOM.createRoot(rootEl);
                root.render(<ErrorBoundary><Root /></ErrorBoundary>);
                console.log('[brevis] React mounted');
            } catch (e) {
                console.error('[brevis] React mount failed:', e);
                // Use textContent (not innerHTML) for error message to prevent XSS
                // if e.message contains attacker-controlled HTML.
                rootEl.innerHTML = '<div style="padding:40px;font-family:sans-serif;background:#FFE5D4;min-height:100vh"><h1>brv.</h1><p></p></div>';
                const msgEl = rootEl.querySelector('p');
                if (msgEl) msgEl.textContent = 'React failed to mount: ' + (e && e.message ? e.message : 'unknown error');
            }
        }


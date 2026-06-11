// Moved verbatim from the former single-module web/src/main.jsx (step B of the
// 2026-06 frontend migration). Logic unchanged; only imports/exports added.
import { useState, useEffect } from 'react';
import { t } from '../i18n.js';
import { AuthView } from './AuthView.jsx';
import { App } from './App.jsx';

export function Root() {
            // null = checking, false = show auth, true = show app
            const [isLoggedIn, setIsLoggedIn] = useState(null);
            const [authError, setAuthError] = useState(null);

            useEffect(() => {
                console.log('[brevis] Root mounted, checking /api/auth/me...');
                fetch('/api/auth/me', { credentials: 'include' })
                    .then(res => {
                        console.log('[brevis] /api/auth/me status:', res.status);
                        setIsLoggedIn(res.ok);
                    })
                    .catch(err => {
                        console.error('[brevis] /api/auth/me failed:', err);
                        setAuthError(err.message);
                        setIsLoggedIn(false);
                    });
            }, []);

            if (isLoggedIn === null) {
                return (
                    <div style={{
                        minHeight: '100vh',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '12px',
                        background: '#FFE5D4',
                        fontFamily: "'Bricolage Grotesque', 'Inter', system-ui, sans-serif",
                        color: '#1A1A1A'
                    }}>
                        <div style={{ fontWeight: 800, fontSize: '48px', letterSpacing: '-0.03em' }}>brv.</div>
                        <div style={{ fontSize: '14px', fontWeight: 500, opacity: 0.6 }}>loading…</div>
                    </div>
                );
            }

            return isLoggedIn
                ? <App />
                : <AuthView onSuccess={() => setIsLoggedIn(true)} />;
        }


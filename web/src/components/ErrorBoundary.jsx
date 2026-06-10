// Moved verbatim from the former single-module web/src/main.jsx (step B of the
// 2026-06 frontend migration). Logic unchanged; only imports/exports added.
import React from 'react';

export class ErrorBoundary extends React.Component {
            constructor(props) {
                super(props);
                this.state = { err: null, info: null };
            }
            static getDerivedStateFromError(err) { return { err }; }
            componentDidCatch(err, info) {
                console.error('[brevis] crash caught by ErrorBoundary:', err);
                console.error('[brevis] component stack:', info && info.componentStack);
                this.setState({ info });
            }
            render() {
                if (this.state.err) {
                    return (
                        <div style={{
                            minHeight: '100vh',
                            padding: '40px 24px',
                            background: '#FFE5D4',
                            fontFamily: "'Inter', system-ui, sans-serif",
                            color: '#1A1A1A'
                        }}>
                            <div style={{ maxWidth: '640px', margin: '0 auto' }}>
                                <div style={{
                                    fontFamily: "'Bricolage Grotesque', 'Inter', system-ui, sans-serif",
                                    fontWeight: 800,
                                    fontSize: '48px',
                                    letterSpacing: '-0.03em',
                                    marginBottom: '8px'
                                }}>brv.</div>
                                <div style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px' }}>
                                    Something crashed while loading the app.
                                </div>
                                <div style={{
                                    background: '#FFCED1',
                                    border: '3px solid #1A1A1A',
                                    borderRadius: '12px',
                                    padding: '16px',
                                    fontSize: '13px',
                                    fontFamily: "'Space Mono', ui-monospace, monospace",
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                    marginBottom: '16px'
                                }}>
                                    {String(this.state.err && this.state.err.message || this.state.err)}
                                </div>
                                <button
                                    onClick={() => window.location.reload()}
                                    style={{
                                        background: '#FFD23F',
                                        border: '3px solid #1A1A1A',
                                        borderRadius: '12px',
                                        padding: '12px 24px',
                                        fontSize: '14px',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        boxShadow: '4px 4px 0 #1A1A1A',
                                        marginRight: '12px'
                                    }}
                                >Reload</button>
                                <a href="/" style={{
                                    display: 'inline-block',
                                    padding: '12px 24px',
                                    border: '3px solid #1A1A1A',
                                    borderRadius: '12px',
                                    textDecoration: 'none',
                                    color: '#1A1A1A',
                                    fontWeight: 700
                                }}>Back to site</a>
                            </div>
                        </div>
                    );
                }
                return this.props.children;
            }
        }

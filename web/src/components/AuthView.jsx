// Moved verbatim from the former single-module web/src/main.jsx (step B of the
// 2026-06 frontend migration). Logic unchanged; only imports/exports added.
import { useState } from 'react';
import { t } from '../i18n.js';
import { BRLogo } from './BRLogo.jsx';

export function AuthView({ onSuccess }) {
            const [isSignUp, setIsSignUp] = useState(false);
            const [email, setEmail] = useState('');
            const [name, setName] = useState('');
            const [password, setPassword] = useState('');
            const [selectedPlan, setSelectedPlan] = useState('standard');
            const [showForgot, setShowForgot] = useState(false);
            const [error, setError] = useState(null);
            const [loading, setLoading] = useState(false);

            const handleSubmit = async (e) => {
                e.preventDefault();
                setError(null);
                setLoading(true);
                try {
                    const endpoint = isSignUp ? '/api/auth/register' : '/api/auth/login';
                    if (isSignUp && password.length < 8) {
                        throw new Error('Password must be at least 8 characters');
                    }
                    const body = isSignUp
                        ? { email, password, name: name || email.split('@')[0] }
                        : { email, password };
                    const res = await fetch(endpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify(body)
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) {
                        const msg = data.error
                            || (data.errors && data.errors[0] && data.errors[0].msg)
                            || (isSignUp ? 'Sign up failed' : 'Invalid credentials');
                        throw new Error(msg);
                    }
                    if (typeof onSuccess === 'function') onSuccess(data.user);
                } catch (err) {
                    setError(err.message || 'Something went wrong');
                } finally {
                    setLoading(false);
                }
            };

            return (
                <div className="auth-container">
                    {!showForgot ? (
                        <div className="auth-card">
                            <div className="auth-header">
                                <BRLogo />
                                <div className="br-wordmark">BREVIS</div>
                            </div>

                            <div className="auth-tabs">
                                <button
                                    className={`auth-tab ${!isSignUp ? 'active' : ''}`}
                                    onClick={() => setIsSignUp(false)}
                                >
                                    {t('signIn')}
                                </button>
                                <button
                                    className={`auth-tab ${isSignUp ? 'active' : ''}`}
                                    onClick={() => setIsSignUp(true)}
                                >
                                    {t('signUp')}
                                </button>
                            </div>

                            <form onSubmit={handleSubmit} className="modal-form">
                                {isSignUp && (
                                    <div className="form-group">
                                        <label className="form-label">Name</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="Your name"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            required
                                        />
                                    </div>
                                )}

                                <div className="form-group">
                                    <label className="form-label">{t('email')}</label>
                                    <input
                                        type="email"
                                        className="form-input"
                                        placeholder="you@example.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">{t('password')}</label>
                                    <input
                                        type="password"
                                        className="form-input"
                                        placeholder={isSignUp ? "min 8 characters" : "••••••••"}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        minLength={isSignUp ? 8 : undefined}
                                        required
                                    />
                                </div>

                                {isSignUp && (
                                    <div className="form-group">
                                        <label className="form-label">{t('confirmPassword')}</label>
                                        <input
                                            type="password"
                                            className="form-input"
                                            placeholder="••••••••"
                                            required
                                        />
                                    </div>
                                )}

                                {isSignUp && (
                                    <div className="form-group">
                                        <label className="form-label">{t('selectPlan')}</label>
                                        <div className="plan-selector">
                                            {[
                                                { id: 'standard', name: t('standard'), price: '$2.99/mo' },
                                                { id: 'premium', name: t('premium'), price: '$4.99/mo' },
                                            ].map((plan) => (
                                                <div
                                                    key={plan.id}
                                                    className={`plan-card ${selectedPlan === plan.id ? 'selected' : ''}`}
                                                    onClick={() => setSelectedPlan(plan.id)}
                                                >
                                                    <div className="plan-name">{plan.name}</div>
                                                    <div className="plan-price">{plan.price}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {!isSignUp && (
                                    <div className="form-group" style={{ textAlign: 'center' }}>
                                        <button
                                            type="button"
                                            className="forgot-link"
                                            onClick={() => setShowForgot(true)}
                                        >
                                            {t('forgotPassword')}
                                        </button>
                                    </div>
                                )}

                                {error && (
                                    <div style={{ background: '#FFCED1', border: '3px solid #1A1A1A', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px', fontSize: '13px', fontWeight: 600, color: '#1A1A1A' }}>
                                        {error}
                                    </div>
                                )}

                                <button type="submit" className="btn btn-primary" disabled={loading}>
                                    {loading ? '...' : (isSignUp ? t('createAccount') : t('login'))}
                                </button>
                            </form>
                        </div>
                    ) : (
                        <div className="auth-card">
                            <div className="auth-header">
                                <div style={{ fontSize: '32px' }}>🔑</div>
                                <div className="br-wordmark">Reset Password</div>
                            </div>

                            <form onSubmit={async (e) => {
                                e.preventDefault();
                                const emailInput = e.target.querySelector('input[type=email]');
                                try {
                                    await fetch('/api/auth/forgot-password', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ email: emailInput.value })
                                    });
                                } catch (_) {}
                                setShowForgot(false);
                            }} className="modal-form">
                                <div className="form-group">
                                    <label className="form-label">{t('email')}</label>
                                    <input
                                        type="email"
                                        className="form-input"
                                        placeholder="you@example.com"
                                        required
                                    />
                                </div>

                                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                                    We'll send a password reset link to your email.
                                </p>

                                <button type="submit" className="btn btn-primary">
                                    Send Reset Link
                                </button>
                                <button
                                    type="button"
                                    className="btn"
                                    onClick={() => setShowForgot(false)}
                                    style={{ marginTop: '12px', background: 'transparent', color: 'var(--ink)' }}
                                >
                                    {t('cancel')}
                                </button>
                            </form>
                        </div>
                    )}
                </div>
            );
        }

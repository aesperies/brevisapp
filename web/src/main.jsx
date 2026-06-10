// Brevis SPA — moved verbatim from public/app.html's inline <script type="text/babel">
// during the 2026-06 frontend build-step migration (step A: one module, no
// restructuring; step B splits into component files). Only changes vs the
// inline original: these imports replace the CDN globals, and ReactDOM comes
// from react-dom/client (same createRoot API the inline code already used).
import React from 'react';
import * as ReactDOM from 'react-dom/client';
import DOMPurify from 'dompurify';
import './styles.css';

        const { useState, useEffect, useRef, useCallback } = React;

        // TRANSLATIONS
        const translations = {
            en: {
                signIn: 'Sign In',
                signUp: 'Sign Up',
                email: 'Email Address',
                password: 'Password',
                confirmPassword: 'Confirm Password',
                forgotPassword: 'Forgot password?',
                login: 'Login',
                createAccount: 'Create Account',
                selectPlan: 'Select Your Plan',
                free: 'Free',
                standard: 'Standard',
                premium: 'Premium',
                allNewsletters: 'All',
                unread: 'Unread',
                read: 'Read',
                tags: 'Tags',
                subscriptions: 'Subscriptions',
                reports: 'Reports',
                intelligence: 'Intelligence',
                knowledgeGraph: 'Knowledge Graph',
                knowledgeBases: 'Knowledge Bases',
                darkMode: 'Dark',
                lightMode: 'Light',
                search: 'Search newsletters...',
                filter: 'Filter',
                viewToggle: 'View',
                selectionMode: 'Select',
                newNewsletter: '+ New Newsletter',
                markRead: 'Mark Read',
                sendToKindle: 'Send to Kindle',
                more: 'More',
                aiSummary: 'AI Summary',
                generateSummary: 'Summarize',
                generatingSummary: 'Summarizing…',
                translateSummary: 'Translate',
                summaryFailed: 'Couldn’t generate summary',
                newsletter: 'Newsletter',
                news: 'News',
                aiNewsBrief: 'AI News Brief',
                importNewsletter: 'Import Newsletter',
                bookmarklet: 'Bookmarklet',
                tagManager: 'Tag Manager',
                rssSubscriptions: 'RSS Subscriptions',
                upgradePlan: 'Upgrade Plan',
                profileSettings: 'Profile & Settings',
                confirmDelete: 'Confirm Delete',
                yes: 'Yes',
                no: 'No',
                close: 'Close',
                cancel: 'Cancel',
                save: 'Save',
                url: 'URL',
                pdf: 'PDF',
                manual: 'Manual',
                copy: 'Copy',
                addTag: 'Add Tag',
                addRss: 'Add RSS Feed',
                currentPlan: 'Current Plan',
                features: 'Features',
                upgrade: 'Upgrade',
                selectPlanText: 'Select a plan to see features',
                name: 'Full Name',
                kindleEmail: 'Kindle Email',
                language: 'Language',
                theme: 'Theme',
                readingTime: 'reading',
                back: 'Back',
                readMoreNewsletters: 'Continue reading',
                deleteConfirm: 'Are you sure?',
                autoTagLabel: 'Auto-tag newsletters by sender',
                autoTagHelp: 'When on, a new newsletter inherits tags it has learned from your past tags on the same sender. You can remove any auto-tag and Brevis will stop suggesting it after a few removals.',
                autoTagBadge: 'Auto-tagged by Brevis',
            },
            es: {
                signIn: 'Iniciar Sesión',
                signUp: 'Crear Cuenta',
                email: 'Correo Electrónico',
                password: 'Contraseña',
                confirmPassword: 'Confirmar Contraseña',
                forgotPassword: '¿Olvidó su contraseña?',
                login: 'Ingresar',
                createAccount: 'Crear Cuenta',
                selectPlan: 'Seleccione su Plan',
                free: 'Gratuito',
                standard: 'Estándar',
                premium: 'Premium',
                allNewsletters: 'Todos',
                unread: 'No Leídos',
                read: 'Leídos',
                tags: 'Etiquetas',
                subscriptions: 'Suscripciones',
                reports: 'Reportes',
                intelligence: 'Inteligencia',
                knowledgeGraph: 'Gráfico de Conocimiento',
                knowledgeBases: 'Base de Conocimiento',
                darkMode: 'Oscuro',
                lightMode: 'Claro',
                search: 'Buscar boletines...',
                filter: 'Filtrar',
                viewToggle: 'Vista',
                selectionMode: 'Seleccionar',
                newNewsletter: '+ Nuevo Boletín',
                markRead: 'Marcar Leído',
                sendToKindle: 'Enviar a Kindle',
                more: 'Más',
                aiSummary: 'Resumen IA',
                generateSummary: 'Resumir',
                generatingSummary: 'Resumiendo…',
                translateSummary: 'Traducir',
                summaryFailed: 'No se pudo generar el resumen',
                newsletter: 'Boletín',
                news: 'Noticias',
                aiNewsBrief: 'Resumen de Noticias IA',
                importNewsletter: 'Importar Boletín',
                bookmarklet: 'Bookmarklet',
                tagManager: 'Gestor de Etiquetas',
                rssSubscriptions: 'Suscripciones RSS',
                upgradePlan: 'Mejorar Plan',
                profileSettings: 'Perfil y Configuración',
                confirmDelete: 'Confirmar Eliminar',
                yes: 'Sí',
                no: 'No',
                close: 'Cerrar',
                cancel: 'Cancelar',
                save: 'Guardar',
                url: 'URL',
                pdf: 'PDF',
                manual: 'Manual',
                copy: 'Copiar',
                addTag: 'Agregar Etiqueta',
                addRss: 'Agregar Feed RSS',
                currentPlan: 'Plan Actual',
                features: 'Características',
                upgrade: 'Mejorar',
                selectPlanText: 'Seleccione un plan para ver características',
                name: 'Nombre Completo',
                kindleEmail: 'Correo Kindle',
                language: 'Idioma',
                theme: 'Tema',
                readingTime: 'lectura',
                back: 'Atrás',
                readMoreNewsletters: 'Continuar leyendo',
                deleteConfirm: '¿Está seguro?',
                autoTagLabel: 'Etiquetar automáticamente por remitente',
                autoTagHelp: 'Cuando está activado, cada boletín nuevo hereda las etiquetas que Brevis aprendió de tus etiquetas anteriores del mismo remitente. Puedes eliminar cualquier etiqueta automática y Brevis dejará de sugerirla tras algunas eliminaciones.',
                autoTagBadge: 'Etiquetado automáticamente por Brevis',
            }
        };

        // MOCK DATA
        const mockNewsletters = [
            {
                id: 1,
                sender: 'Morning Brew',
                date: '2h ago',
                title: "Apple's AI Play Changes Everything",
                tags: ['Tech', 'AI'],
                summary: 'Apple announced a major AI initiative focusing on on-device processing and privacy. The move could reshape how enterprise handles sensitive data. Key point: 40% reduction in API calls.',
                content: `<h2>Apple Enters the AI Arena</h2><p>In a surprising move today, Apple announced a comprehensive AI strategy that focuses on on-device processing and user privacy. This represents a significant shift from the cloud-first approaches dominating the industry.</p><p>The initiative includes three main pillars: on-device processing, federated learning, and privacy-preserving data analysis. Enterprise customers are already expressing interest in the privacy guarantees this approach offers.</p><h2>Enterprise Implications</h2><p>For legal and compliance teams, the implications are substantial. On-device processing means sensitive documents never leave the user's hardware. This could fundamentally change how enterprises approach document management and contract review.</p><p>Early benchmarks show a 40% reduction in API calls compared to cloud-based solutions, with processing latency under 500ms for most operations.</p>`,
                isUnread: true,
                isRead: false,
            },
            {
                id: 2,
                sender: 'The Information',
                date: '5h ago',
                title: 'Q1 2026 Funding Record Shatters Expectations',
                tags: ['VC/PE', 'Markets'],
                summary: 'Venture capital surges to highest Q1 on record with $89B deployed. Early-stage funding up 45% YoY. Legal tech and compliance automation leading category growth.',
                content: `<h2>VC Market Heats Up</h2><p>Venture capital funding in Q1 2026 reached an all-time high of $89 billion, shattering previous quarterly records. This surge reflects strong investor confidence despite macroeconomic headwinds.</p><p>Legal tech and compliance automation emerged as standout categories, with combined funding exceeding $4.2B. The trend reflects enterprises' urgent need for operational efficiency.</p>`,
                isUnread: true,
                isRead: false,
            },
            {
                id: 3,
                sender: 'Legaltech News',
                date: '8h ago',
                title: 'Contract Review AI: New Wave of Automation',
                tags: ['Legal', 'Automation'],
                summary: 'Five new contract review platforms launched this month using GPT-4 and fine-tuning. Success rates exceed 94%. Industry consolidation expected within 18 months.',
                content: `<h2>Contract Review Transformed</h2><p>The legal tech landscape shifted dramatically as five major platforms launched advanced contract review capabilities. These solutions leverage large language models with industry-specific fine-tuning.</p><p>Success rates consistently exceed 94% on common contract types. The implications for law firms are profound: contract review efficiency increased 5x, with cost per document dropping 60%.</p>`,
                isUnread: true,
                isRead: false,
            },
            {
                id: 4,
                sender: 'Stratechery',
                date: '1d ago',
                title: 'Gaming Platform Shifts: Who Wins',
                tags: ['Gaming', 'Strategy'],
                summary: 'Console gaming enters new era with streaming dominance. Microsoft and Sony announce aggressive cloud gaming investments. Indies gain distribution leverage.',
                content: `<h2>The Streaming Era Begins</h2><p>Gaming platforms are undergoing their most significant transformation since the last console generation. Cloud gaming technology has matured enough for mainstream adoption.</p><p>Microsoft and Sony both announced multi-billion dollar commitments to cloud infrastructure. This shift has unexpected winners: independent developers gain direct access to enterprise gaming infrastructure.</p>`,
                isUnread: false,
                isRead: true,
            },
            {
                id: 5,
                sender: 'CB Insights',
                date: '1d ago',
                title: 'Web3 Market Map 2026 Edition',
                tags: ['Web3', 'Markets'],
                summary: 'Blockchain infrastructure stabilizes around 3 major protocols. DeFi TVL reaches $250B. Enterprise adoption accelerates in supply chain sector.',
                content: `<h2>Web3 Market Consolidation</h2><p>The Web3 landscape has consolidated around three dominant protocols, each serving distinct use cases. Market capitalization has stabilized at $2.1 trillion.</p><p>Enterprise adoption accelerated dramatically in the supply chain sector, where immutable audit trails provide significant value. DeFi total value locked reached an all-time high of $250B.</p>`,
                isUnread: false,
                isRead: true,
            },
            {
                id: 6,
                sender: 'Harvard Law Review',
                date: '3d ago',
                title: 'Digital Asset Regulation: Global Framework Emerges',
                tags: ['Legal', 'Regulation'],
                summary: 'International regulatory bodies announce coordinated digital asset framework. 47 countries commit to unified standards. Legal compliance burden reduced by estimated 30%.',
                content: `<h2>Global Regulatory Alignment</h2><p>A historic moment for digital asset regulation: 47 countries announced a unified regulatory framework for cryptocurrencies and blockchain assets.</p><p>The framework establishes clear jurisdictional rules, consistent KYC/AML standards, and interoperable compliance protocols. Legal teams estimate compliance burden reduction of approximately 30% compared to prior multi-jurisdictional approaches.</p>`,
                isUnread: false,
                isRead: true,
            },
        ];

        const mockTags = [
            { name: 'Tech', color: '#FFD23F' },
            { name: 'VC/PE', color: '#B5EAD7' },
            { name: 'Legal', color: '#FFCED1' },
            { name: 'Markets', color: '#C5DEFF' },
            { name: 'AI', color: '#E4D4FC' },
        ];

        // ICON SVG COMPONENTS
        const BRLogo = () => (
            <svg width="36" height="36" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" className="br-logo">
                <g transform="rotate(-4 100 100)">
                    <rect x="14" y="14" width="172" height="172" rx="22" fill="#FFD23F" stroke="#1A1A1A" strokeWidth="8"/>
                    <text x="100" y="136" fontFamily="'Bricolage Grotesque', 'Inter', system-ui, sans-serif" fontWeight="800" fontSize="92" textAnchor="middle" fill="#1A1A1A" letterSpacing="-5">brv.</text>
                </g>
            </svg>
        );

        // HELPERS
        function t(key, lang = 'en') {
            return translations[lang]?.[key] || key;
        }

        // AUTH VIEW COMPONENT
        function AuthView({ onSuccess }) {
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
                                                { id: 'free', name: t('free'), price: '$0' },
                                                { id: 'standard', name: t('standard'), price: '$12' },
                                                { id: 'premium', name: t('premium'), price: '$29' },
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

        // Normalize a newsletter row from the API (snake_case) into the
        // shape the UI expects (camelCase + friendly date).
        function normalizeNewsletter(n) {
            const raw = n.date_added || n.created_at || null;
            let date = '';
            if (raw) {
                const d = new Date(raw);
                const diffMs = Date.now() - d.getTime();
                const mins = Math.round(diffMs / 60000);
                const hrs = Math.round(diffMs / 3600000);
                const days = Math.round(diffMs / 86400000);
                if (mins < 60) date = mins + 'm ago';
                else if (hrs < 24) date = hrs + 'h ago';
                else if (days < 30) date = days + 'd ago';
                else date = d.toLocaleDateString();
            }
            // Collect auto-tagged tag names so the UI can render a small badge
            // on tags that Brevis applied automatically (vs. ones the user added).
            const tagList = Array.isArray(n.tags) ? n.tags : [];
            const autoTags = new Set(
                tagList
                    .filter(t => t && typeof t === 'object' && t.auto_tagged)
                    .map(t => t.name || '')
                    .filter(Boolean)
            );
            return {
                id: n.id,
                sender: n.sender || '',
                title: n.title || '',
                date,
                tags: tagList.map(t => typeof t === 'string' ? t : (t && t.name) || '').filter(Boolean),
                autoTags,
                summary: n.summary || '',
                summary_language: n.summary_language || null,
                content: n.content || '',
                url: n.url || null,
                isRead: !!n.is_read,
                isUnread: !n.is_read,
            };
        }

        // Format an AI summary: strip markdown bold/italic asterisks,
        // split into bullet points on sentence boundaries or existing line breaks.
        function formatSummaryHTML(raw) {
            if (!raw) return '';
            let s = raw
                .replace(/\*\*([^*]+)\*\*/g, '$1')   // **bold** → plain
                .replace(/\*([^*]+)\*/g, '$1')         // *italic* → plain
                .replace(/__([^_]+)__/g, '$1')         // __bold__ → plain
                .replace(/_([^_]+)_/g, '$1')           // _italic_ → plain
                .trim();
            // Split into bullet points: on existing newlines, or on ". " followed by uppercase
            let parts = s.split(/\n+/).map(l => l.trim()).filter(Boolean);
            if (parts.length <= 1) {
                // Try splitting on sentence boundaries for long single-line summaries
                parts = s.split(/(?<=\.)\s+(?=[A-Z])/).filter(p => p.trim().length > 10);
            }
            if (parts.length <= 1) return '<p>' + s + '</p>';
            return '<ul>' + parts.map(p => '<li>' + p.replace(/^[-•]\s*/, '') + '</li>').join('') + '</ul>';
        }

        // Collapsible summary toggle component
        function SummaryToggle({ summary }) {
            const [open, setOpen] = useState(false);
            if (!summary) return null;
            return (
                <div className="summary-toggle" onClick={(e) => e.stopPropagation()}>
                    <button
                        className="summary-toggle-btn"
                        onClick={(e) => { e.stopPropagation(); setOpen(prev => !prev); }}
                    >
                        <span className={`summary-chevron ${open ? 'open' : ''}`}>▸</span>
                        <span className="summary-toggle-label">✦ AI Summary</span>
                    </button>
                    {open && (
                        <div
                            className="summary-toggle-body"
                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(formatSummaryHTML(summary)) }}
                        />
                    )}
                </div>
            );
        }

        // MAIN APP COMPONENT
        function App() {
            const [currentView, setCurrentView] = useState('newsletters');
            const [selectedNewsletter, setSelectedNewsletter] = useState(null);
            const [newsLetters, setNewsletters] = useState([]);
            const [tags, setTags] = useState([]);
            const [subscriptions, setSubscriptions] = useState([]);
            const [user, setUser] = useState(null);
            const [dataLoading, setDataLoading] = useState(true);
            const [dataError, setDataError] = useState(null);
            const [selectedItems, setSelectedItems] = useState([]);
            const [selectionMode, setSelectionMode] = useState(false);
            const [filter, setFilter] = useState('all');
            const [activeTag, setActiveTag] = useState(null);
            const [filterTags, setFilterTags] = useState([]);
            const [viewMode, setViewMode] = useState('list');
            const [searchQuery, setSearchQuery] = useState('');
            const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
            const [language, setLanguage] = useState(() => localStorage.getItem('language') || 'en');
            const [activeModal, setActiveModal] = useState(null);
            const [sidebarOpen, setSidebarOpen] = useState(false);
            const [importing, setImporting] = useState(false);
            const [importError, setImportError] = useState(null);
            const [emailDomain, setEmailDomain] = useState('mail.brevisapp.com');
            // Per-newsletter "summarizing" flags. Set<number> of newsletter ids.
            // Cleared when the request resolves (success or error) so the button
            // can be retried.
            const [summarizingIds, setSummarizingIds] = useState(() => new Set());

            // Snapshot of the user's settings at the moment the settings modal opens.
            // Used to dirty-check on save: the auto-tag toggle is a controlled checkbox
            // that mutates `user` immediately, so without this snapshot the dirty check
            // (initialAutoTag vs nextAutoTag both reading from `user`) would always say
            // "not dirty" and the toggle would silently never persist.
            // We snapshot once per modal opening and clear on close.
            const initialSettingsRef = useRef(null);
            useEffect(() => {
                if (activeModal === 'settings') {
                    if (!initialSettingsRef.current && user) {
                        initialSettingsRef.current = {
                            name: user.name || '',
                            kindle_email: user.kindle_email || '',
                            auto_tag_enabled: user.auto_tag_enabled !== false,
                        };
                    }
                } else if (initialSettingsRef.current) {
                    initialSettingsRef.current = null;
                }
            }, [activeModal, user]);

            // Reset import-modal transient state whenever the modal closes
            // so reopening starts fresh.
            useEffect(() => {
                if (activeModal !== 'import') {
                    setImporting(false);
                    setImportError(null);
                }
            }, [activeModal]);

            // Load newsletters, tags, subscriptions, user profile.
            // `silent` skips the loading spinner (used by polling + focus refetch).
            const loadData = useCallback(async ({ silent = false } = {}) => {
                try {
                    if (!silent) setDataLoading(true);
                    const [nRes, tRes, sRes, uRes] = await Promise.all([
                        fetch('/api/newsletters', { credentials: 'include' }),
                        fetch('/api/tags', { credentials: 'include' }),
                        fetch('/api/subscriptions', { credentials: 'include' }),
                        fetch('/api/auth/me', { credentials: 'include' }),
                    ]);
                    if (!nRes.ok) throw new Error('Failed to load newsletters (' + nRes.status + ')');
                    if (!tRes.ok) throw new Error('Failed to load tags (' + tRes.status + ')');
                    const nJson = await nRes.json();
                    const tJson = await tRes.json();
                    const sJson = sRes.ok ? await sRes.json() : [];
                    const uJson = uRes.ok ? await uRes.json() : {};
                    const nArr = Array.isArray(nJson) ? nJson : (nJson.newsletters || []);
                    const tArr = Array.isArray(tJson) ? tJson : (tJson.tags || []);
                    const sArr = Array.isArray(sJson) ? sJson : (sJson.subscriptions || []);
                    setNewsletters(nArr.map(normalizeNewsletter));
                    setTags(tArr.map(t => ({
                        id: t.id,
                        name: t.name,
                        color: t.color || '#FFD23F',
                    })));
                    setSubscriptions(sArr);
                    setUser(uJson.user || uJson);
                    setDataError(null);
                } catch (err) {
                    console.error('[brevis] data load failed:', err);
                    if (!silent) setDataError(err.message || 'Failed to load data');
                } finally {
                    if (!silent) setDataLoading(false);
                }
            }, []);

            // Initial load on mount.
            useEffect(() => { loadData(); }, [loadData]);

            // Email forwarding domain — fetched once from backend so the UI
            // always matches the SendGrid Inbound Parse config (Railway env var).
            useEffect(() => {
                let cancelled = false;
                fetch('/api/config/email-domain')
                    .then(r => r.ok ? r.json() : null)
                    .then(data => { if (!cancelled && data && data.domain) setEmailDomain(data.domain); })
                    .catch(() => { /* fall back to default state */ });
                return () => { cancelled = true; };
            }, []);

            // Auto-refresh: poll every 30s and refetch when the tab regains focus,
            // so newsletters arriving via email-forwarding / RSS show up without a manual reload.
            useEffect(() => {
                const POLL_MS = 30000;
                let intervalId = null;
                const startPolling = () => {
                    if (intervalId == null) intervalId = setInterval(() => loadData({ silent: true }), POLL_MS);
                };
                const stopPolling = () => {
                    if (intervalId != null) { clearInterval(intervalId); intervalId = null; }
                };
                const onVisibility = () => {
                    if (document.visibilityState === 'visible') {
                        loadData({ silent: true });
                        startPolling();
                    } else {
                        stopPolling();
                    }
                };
                if (document.visibilityState === 'visible') startPolling();
                document.addEventListener('visibilitychange', onVisibility);
                return () => {
                    stopPolling();
                    document.removeEventListener('visibilitychange', onVisibility);
                };
            }, [loadData]);

            useEffect(() => {
                document.documentElement.setAttribute('data-theme', theme);
                localStorage.setItem('theme', theme);
            }, [theme]);

            useEffect(() => {
                localStorage.setItem('language', language);
            }, [language]);

            const toggleTheme = () => {
                setTheme(theme === 'light' ? 'dark' : 'light');
            };

            const handleSelectItem = (id) => {
                setSelectedItems(prev =>
                    prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
                );
            };

            // Trigger AI summary generation for a newsletter. The endpoint is
            // gated on the user's plan; FREE returns 403, which we map to the
            // upgrade modal. On success we merge the returned summary into both
            // the list state and the open reader (if it matches).
            const generateSummary = async (id) => {
                if (!user || user.plan === 'free') {
                    setActiveModal('upgrade');
                    return;
                }
                if (summarizingIds.has(id)) return;
                setSummarizingIds(prev => { const next = new Set(prev); next.add(id); return next; });
                try {
                    const res = await fetch(`/api/newsletters/${id}/summary`, {
                        method: 'POST',
                        credentials: 'include',
                    });
                    if (res.status === 403) {
                        setActiveModal('upgrade');
                        return;
                    }
                    if (!res.ok) {
                        const body = await res.json().catch(() => ({}));
                        throw new Error(body.error || `HTTP ${res.status}`);
                    }
                    const data = await res.json();
                    const patch = { summary: data.summary, summary_language: language };
                    setNewsletters(prev => prev.map(n => n.id === id ? { ...n, ...patch } : n));
                    setSelectedNewsletter(prev => (prev && prev.id === id) ? { ...prev, ...patch } : prev);
                } catch (err) {
                    console.error('[brevis] generateSummary failed:', err);
                    alert(t('summaryFailed') + ': ' + err.message);
                } finally {
                    setSummarizingIds(prev => { const next = new Set(prev); next.delete(id); return next; });
                }
            };

            const filteredNewsletters = newsLetters.filter(n => {
                // Read/unread filter
                if (filter === 'unread' && !n.isUnread) return false;
                if (filter === 'read' && !n.isRead) return false;
                // Sidebar tag filter (single tag)
                if (activeTag && !n.tags.includes(activeTag)) return false;
                // Modal multi-tag filter
                if (filterTags.length > 0 && !filterTags.some(ft => n.tags.includes(ft))) return false;
                // Search
                if (searchQuery) {
                    const q = searchQuery.toLowerCase();
                    if (!(n.title||'').toLowerCase().includes(q) &&
                        !(n.sender||'').toLowerCase().includes(q) &&
                        !(n.summary||'').toLowerCase().includes(q)) return false;
                }
                return true;
            });

            const t = (key) => translations[language]?.[key] || key;

            return (
                <>
                    {/* SIDEBAR */}
                    <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
                        <div className="sidebar-logo-section">
                            <BRLogo />
                            <div className="sidebar-brand">
                                <div className="sidebar-wordmark">BREVIS</div>
                                <div className="plan-badge" onClick={() => setActiveModal('upgrade')} style={{ cursor: 'pointer' }}>
                                    {(user && user.plan) ? user.plan.toUpperCase() : 'FREE'}
                                </div>
                            </div>
                        </div>

                        <button className="btn btn-primary new-newsletter-btn" onClick={() => setActiveModal('import')}>
                            {t('newNewsletter')}
                        </button>

                        {/* NAVIGATION */}
                        <div className="nav-section">
                            {[
                                { id: 'all', label: t('allNewsletters'), count: filteredNewsletters.length },
                                { id: 'unread', label: t('unread'), count: newsLetters.filter(n => n.isUnread).length },
                                { id: 'read', label: t('read'), count: newsLetters.filter(n => n.isRead).length },
                            ].map(item => (
                                <div
                                    key={item.id}
                                    className={`nav-item ${filter === item.id ? 'active' : ''}`}
                                    onClick={() => {
                                        setFilter(item.id);
                                        setSidebarOpen(false);
                                    }}
                                >
                                    <span>{item.label}</span>
                                    <span className="count-pill">{item.count}</span>
                                </div>
                            ))}
                        </div>

                        {/* TAGS */}
                        <div className="nav-section tags-section">
                            <div className="nav-section-title">{t('tags')}</div>
                            {tags.map(tag => (
                                <div
                                    key={tag.name}
                                    className={`tag-item ${activeTag === tag.name ? 'active-tag' : ''}`}
                                    onClick={() => {
                                        setActiveTag(prev => prev === tag.name ? null : tag.name);
                                        setSidebarOpen(false);
                                    }}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <div className="tag-dot" style={{ backgroundColor: tag.color }}></div>
                                    {tag.name}
                                </div>
                            ))}
                        </div>

                        {/* FORWARDING EMAIL */}
                        {user && user.email_code && (
                            <div className="nav-section" style={{ padding: '12px', background: 'var(--yellow)', borderRadius: '10px', border: '2px solid var(--ink)', margin: '0 8px 8px' }}>
                                <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px', opacity: 0.7 }}>Forward newsletters to:</div>
                                <div style={{ fontSize: '12px', fontWeight: 600, wordBreak: 'break-all', fontFamily: "'Space Mono', monospace" }}>
                                    {user.email_code}@{emailDomain}
                                </div>
                            </div>
                        )}

                        {/* SUBSCRIPTIONS */}
                        <div className="nav-section">
                            <div className="nav-section-title">{t('subscriptions')}</div>
                            {subscriptions.length === 0 ? (
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '4px 12px' }}>No RSS subscriptions yet</div>
                            ) : subscriptions.map(sub => (
                                <div key={sub.id} className="tag-item" title={sub.url}>
                                    🔗 {sub.name || sub.url}
                                </div>
                            ))}
                        </div>

                        {/* INTELLIGENCE */}
                        <div className="nav-section">
                            <div className="nav-section-title">{t('intelligence')}</div>
                            <button
                                className="btn"
                                onClick={() => { setActiveModal('graph'); setSidebarOpen(false); }}
                                style={{ width: '100%', marginBottom: '8px' }}
                            >
                                {t('knowledgeGraph')}
                            </button>
                            <button
                                className="btn"
                                onClick={() => { setActiveModal('kb'); setSidebarOpen(false); }}
                                style={{ width: '100%' }}
                            >
                                {t('knowledgeBases')}
                            </button>
                        </div>

                        {/* BOTTOM CONTROLS */}
                        <div className="sidebar-bottom">
                            <div className="toggle-group">
                                <button
                                    className={`toggle-btn ${theme === 'light' ? 'active' : ''}`}
                                    onClick={() => setTheme('light')}
                                    title="Light mode"
                                >
                                    ☀️ {t('lightMode')}
                                </button>
                                <button
                                    className={`toggle-btn ${theme === 'dark' ? 'active' : ''}`}
                                    onClick={() => setTheme('dark')}
                                    title="Dark mode"
                                >
                                    🌙 {t('darkMode')}
                                </button>
                            </div>

                            <div className="toggle-group">
                                <button
                                    className={`toggle-btn ${language === 'en' ? 'active' : ''}`}
                                    onClick={() => setLanguage('en')}
                                >
                                    EN
                                </button>
                                <button
                                    className={`toggle-btn ${language === 'es' ? 'active' : ''}`}
                                    onClick={() => setLanguage('es')}
                                >
                                    ES
                                </button>
                            </div>

                            <div className="sidebar-icons">
                                <button className="icon-btn" onClick={() => setActiveModal('settings')} title="Settings">
                                    ⚙️
                                </button>
                                <div className="user-avatar">{user && user.name ? user.name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() : '?'}</div>
                            </div>
                        </div>
                    </aside>

                    {/* MAIN CONTENT */}
                    <div className="main-content">
                        {/* TOP BAR */}
                        <div className="top-bar">
                            <button
                                className="icon-btn"
                                onClick={() => setSidebarOpen(!sidebarOpen)}
                                style={{ display: 'none', '@media (max-width: 768px)': { display: 'block' } }}
                            >
                                ☰
                            </button>

                            <div className="search-container">
                                <span className="search-icon">🔍</span>
                                <input
                                    type="text"
                                    className="search-input"
                                    placeholder={t('search')}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>

                            <button
                                className={`filter-dropdown ${filterTags.length > 0 ? 'active' : ''}`}
                                onClick={() => setActiveModal('filter')}
                                style={filterTags.length > 0 ? { background: 'var(--yellow)', fontWeight: 700 } : {}}
                            >
                                {t('filter')}{filterTags.length > 0 ? ` (${filterTags.length})` : ''}
                            </button>
                            <button
                                className={`view-toggle ${viewMode === 'card' ? 'active' : ''}`}
                                onClick={() => setViewMode(prev => prev === 'list' ? 'card' : 'list')}
                                style={viewMode === 'card' ? { background: 'var(--yellow)', fontWeight: 700 } : {}}
                            >
                                {viewMode === 'list' ? '📊' : '📋'} {t('viewToggle')}
                            </button>
                            <button
                                className={`selection-mode ${selectionMode ? 'active' : ''}`}
                                onClick={() => { setSelectionMode(prev => !prev); setSelectedItems([]); }}
                                style={selectionMode ? { background: 'var(--yellow)', fontWeight: 700 } : {}}
                            >
                                ✓ {t('selectionMode')}
                            </button>
                        </div>

                        {/* BULK ACTIONS */}
                        {selectedItems.length > 0 && (
                            <div className="bulk-actions-bar active">
                                <span className="bulk-count">
                                    {selectedItems.length} selected
                                </span>
                                <button className="btn" style={{ background: 'var(--bg-cream)' }}>
                                    ✓ {t('markRead')}
                                </button>
                                <button className="btn" style={{ background: 'var(--bg-cream)' }}>
                                    📧 {t('sendToKindle')}
                                </button>
                                <button
                                    className="btn"
                                    onClick={() => setSelectedItems([])}
                                    style={{ background: 'var(--red)', color: 'white' }}
                                >
                                    Clear
                                </button>
                            </div>
                        )}

                        {/* NEWSLETTER LIST / GRID */}
                        {dataLoading ? (
                            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                <div style={{ fontWeight: 800, fontSize: '32px', marginBottom: '8px', fontFamily: "'Bricolage Grotesque', sans-serif" }}>brv.</div>
                                Loading newsletters...
                            </div>
                        ) : dataError ? (
                            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--red)' }}>
                                {dataError}
                                <button className="btn" onClick={() => window.location.reload()} style={{ marginTop: '12px' }}>Retry</button>
                            </div>
                        ) : filteredNewsletters.length === 0 ? (
                            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                {newsLetters.length === 0
                                    ? 'No newsletters yet — forward emails to your Brevis address to get started!'
                                    : 'No newsletters match your current filters.'}
                            </div>
                        ) : null}
                        <div className={`newsletter-list ${viewMode === 'card' ? 'card-mode' : ''}`}>
                            {filteredNewsletters.map(newsletter => (
                                <div
                                    key={newsletter.id}
                                    className={`newsletter-card ${newsletter.isRead ? 'read' : ''} ${selectedItems.includes(newsletter.id) ? 'selected' : ''}`}
                                    onClick={() => {
                                        if (selectionMode) {
                                            handleSelectItem(newsletter.id);
                                        } else {
                                            setSelectedNewsletter(newsletter);
                                            setCurrentView('reader');
                                        }
                                    }}
                                >
                                    {selectionMode && (
                                        <div className={`select-checkbox ${selectedItems.includes(newsletter.id) ? 'checked' : ''}`}>
                                            {selectedItems.includes(newsletter.id) ? '✓' : ''}
                                        </div>
                                    )}
                                    <div className="newsletter-header">
                                        <div className="newsletter-meta">
                                            <div className="newsletter-sender">{newsletter.sender}</div>
                                            <div className="newsletter-date">{newsletter.date}</div>
                                        </div>
                                        <div className="newsletter-badges">
                                            {newsletter.isUnread && (
                                                <div className="badge badge-new">NEW</div>
                                            )}
                                        </div>
                                    </div>

                                    <h3 className="newsletter-title">{newsletter.title}</h3>

                                    <div className="newsletter-tags">
                                        {newsletter.tags.map(tag => {
                                            const isAuto = newsletter.autoTags && newsletter.autoTags.has(tag);
                                            return (
                                                <span
                                                    key={tag}
                                                    className={'tag-pill' + (isAuto ? ' tag-pill--auto' : '')}
                                                    title={isAuto ? t('autoTagBadge') : undefined}
                                                >
                                                    {isAuto && <span className="tag-pill__auto-dot" aria-hidden="true">✦</span>}
                                                    {tag}
                                                </span>
                                            );
                                        })}
                                    </div>

                                    <SummaryToggle summary={newsletter.summary} />

                                    <div className="newsletter-actions">
                                        <button
                                            className="action-btn"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedNewsletter(prev => ({
                                                    ...prev,
                                                    isRead: !prev.isRead,
                                                }));
                                            }}
                                            title={t('markRead')}
                                        >
                                            ✓
                                        </button>
                                        {/* Summary: visible when we don't already have one in the current language.
                                            Shows ⏳ while a request is in-flight. Clicking on FREE plan opens
                                            the upgrade modal instead of hitting the API. */}
                                        {(!newsletter.summary || newsletter.summary_language !== language) && (
                                            <button
                                                className="action-btn"
                                                onClick={(e) => { e.stopPropagation(); generateSummary(newsletter.id); }}
                                                disabled={summarizingIds.has(newsletter.id)}
                                                title={
                                                    summarizingIds.has(newsletter.id)
                                                        ? t('generatingSummary')
                                                        : (newsletter.summary ? t('translateSummary') : t('generateSummary'))
                                                }
                                            >
                                                {summarizingIds.has(newsletter.id) ? '⏳' : '✦'}
                                            </button>
                                        )}
                                        <button
                                            className="action-btn"
                                            onClick={(e) => { e.stopPropagation(); }}
                                            title={t('sendToKindle')}
                                        >
                                            📧
                                        </button>
                                        <div className="action-menu">
                                            <button className="action-btn" onClick={(e) => {
                                                e.stopPropagation();
                                                const menu = e.currentTarget.parentElement.querySelector('.action-menu-dropdown');
                                                menu.classList.toggle('active');
                                            }}>
                                                ⋯
                                            </button>
                                            <div className="action-menu-dropdown">
                                                <div className="action-menu-item">Edit tags</div>
                                                <div className="action-menu-item">Move to folder</div>
                                                <div className="action-menu-item" style={{ color: 'var(--red)' }}>Delete</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* READER VIEW */}
                    {selectedNewsletter && (
                        <div className="reader-overlay active">
                            <div className="reader-top-bar">
                                <button
                                    className="reader-back-btn"
                                    onClick={() => {
                                        setSelectedNewsletter(null);
                                        setCurrentView('newsletters');
                                    }}
                                >
                                    ←
                                </button>
                                <h1 className="reader-title">{selectedNewsletter.title}</h1>
                                <div className="reader-actions">
                                    <button className="btn" style={{ padding: '8px 12px', fontSize: '12px' }}>
                                        {t('markRead')}
                                    </button>
                                    <button className="btn" style={{ padding: '8px 12px', fontSize: '12px' }}>
                                        {t('sendToKindle')}
                                    </button>
                                </div>
                            </div>
                            <div className="reader-progress" style={{ width: '35%' }}></div>

                            <div className="reader-content">
                                <div className="reader-body">
                                    <h1 className="reader-body-title">{selectedNewsletter.title}</h1>

                                    <div className="reader-metadata">
                                        <span><strong>{selectedNewsletter.sender}</strong></span>
                                        <span>•</span>
                                        <span>{selectedNewsletter.date}</span>
                                        <span>•</span>
                                        <span>5 min {t('readingTime')}</span>
                                    </div>

                                    <div className="reader-summary">
                                        <div className="reader-summary-title">
                                            ✦ {t('aiSummary')}
                                        </div>
                                        {selectedNewsletter.summary ? (
                                            <div
                                                className="reader-text"
                                                dangerouslySetInnerHTML={{
                                                    __html: DOMPurify.sanitize(formatSummaryHTML(selectedNewsletter.summary))
                                                }}
                                            />
                                        ) : (
                                            <button
                                                className="btn"
                                                style={{ marginTop: '8px' }}
                                                onClick={() => generateSummary(selectedNewsletter.id)}
                                                disabled={summarizingIds.has(selectedNewsletter.id)}
                                            >
                                                {summarizingIds.has(selectedNewsletter.id) ? t('generatingSummary') : ('✦ ' + t('generateSummary'))}
                                            </button>
                                        )}
                                    </div>

                                    <div
                                        className="reader-text"
                                        dangerouslySetInnerHTML={{
                                            __html: DOMPurify.sanitize(selectedNewsletter.content)
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* IMPORT MODAL */}
                    {activeModal === 'import' && (
                        <div className="modal-overlay active" onClick={() => setActiveModal(null)}>
                            <div className="modal" onClick={(e) => e.stopPropagation()}>
                                <button className="modal-close-btn" onClick={() => setActiveModal(null)}>✕</button>
                                <h2 className="modal-title">{t('importNewsletter')}</h2>

                                <div className="modal-tabs">
                                    <button className="modal-tab active">URL</button>
                                    <button className="modal-tab">PDF</button>
                                    <button className="modal-tab">{t('manual')}</button>
                                </div>

                                <form className="modal-form" onSubmit={async (e) => {
                                    e.preventDefault();
                                    if (importing) return;
                                    const url = (e.target.elements.url.value || '').trim();
                                    if (!url) return;
                                    // Defense-in-depth: server validates too, but a 1-line
                                    // guard saves a round-trip on the most common typo.
                                    if (!/^https?:\/\//i.test(url)) {
                                        setImportError('URL must start with http:// or https://');
                                        return;
                                    }
                                    setImporting(true);
                                    setImportError(null);
                                    try {
                                        const res = await fetch('/api/import/url', {
                                            method: 'POST',
                                            credentials: 'include',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ url }),
                                        });
                                        if (!res.ok) {
                                            const errBody = await res.json().catch(() => ({}));
                                            throw new Error(errBody.error || `Import failed (${res.status})`);
                                        }
                                        const created = await res.json();
                                        const normalized = normalizeNewsletter(created.newsletter || created);
                                        // De-dupe by id: if a background refetch already pulled this
                                        // newsletter into the list while the request was in-flight, the
                                        // second copy would warn about duplicate keys in React.
                                        setNewsletters(prev => [normalized, ...prev.filter(n => n.id !== normalized.id)]);
                                        setActiveModal(null);
                                    } catch (err) {
                                        console.error('[brevis] import failed:', err);
                                        setImportError(err.message || 'Import failed');
                                    } finally {
                                        setImporting(false);
                                    }
                                }}>
                                    <div className="form-group">
                                        <label className="form-label">{t('url')}</label>
                                        <input name="url" type="url" className="form-input" placeholder="https://..." required disabled={importing} />
                                    </div>
                                    {importError && (
                                        <div className="form-error" style={{ color: 'var(--accent-red, #c0392b)', fontSize: '13px', marginBottom: '12px', padding: '8px 12px', background: 'rgba(192,57,43,0.08)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: '8px' }}>
                                            {importError}
                                        </div>
                                    )}
                                    <button type="submit" className="btn btn-primary" disabled={importing}>
                                        {importing ? 'Importing…' : 'Import'}
                                    </button>
                                </form>
                            </div>
                        </div>
                    )}

                    {/* KNOWLEDGE GRAPH MODAL */}
                    {activeModal === 'graph' && (
                        <div className="modal-overlay active" onClick={() => setActiveModal(null)}>
                            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '1000px', maxHeight: '90vh' }}>
                                <button className="modal-close-btn" onClick={() => setActiveModal(null)}>✕</button>
                                <h2 className="modal-title">{t('knowledgeGraph')}</h2>

                                <div className="modal-tabs">
                                    <button className="modal-tab active">Browse</button>
                                    <button className="modal-tab">Query</button>
                                </div>

                                <div className="graph-container" style={{ height: '400px', background: 'linear-gradient(135deg, var(--bg-cream), var(--bg-blue))', border: '3px solid var(--ink)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                                        <div style={{ fontSize: '48px', marginBottom: '12px' }}>🕸️</div>
                                        <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>Knowledge Graph is building</div>
                                        <div style={{ fontSize: '13px', maxWidth: '300px' }}>Your graph grows automatically as Brevis processes newsletters. Keep reading — connections will appear here soon.</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* KB MODAL */}
                    {activeModal === 'kb' && (
                        <div className="modal-overlay active" onClick={() => setActiveModal(null)}>
                            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px' }}>
                                <button className="modal-close-btn" onClick={() => setActiveModal(null)}>✕</button>
                                <h2 className="modal-title">{t('knowledgeBases')}</h2>

                                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                    <div style={{ fontSize: '48px', marginBottom: '12px' }}>📚</div>
                                    <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>No Knowledge Bases yet</div>
                                    <div style={{ fontSize: '13px' }}>Knowledge bases are auto-created from your newsletters as you read. The more you use Brevis, the smarter it gets.</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* UPGRADE PLAN MODAL */}
                    {activeModal === 'upgrade' && (
                        <div className="modal-overlay active" onClick={() => setActiveModal(null)}>
                            <div className="modal" onClick={(e) => e.stopPropagation()}>
                                <button className="modal-close-btn" onClick={() => setActiveModal(null)}>✕</button>
                                <h2 className="modal-title">{t('upgradePlan')}</h2>

                                <div className="plan-cards">
                                    {[
                                        { id: 'free', name: 'Free', price: '$0', features: ['5 newsletters', 'Basic summaries'] },
                                        { id: 'standard', name: 'Standard', price: '$12/mo', features: ['Unlimited newsletters', 'AI summaries', 'Tags & folders'] },
                                        { id: 'premium', name: 'Premium', price: '$29/mo', features: ['Everything in Standard', 'Knowledge Graph', 'Custom AI rules'] },
                                    ].map((plan) => {
                                        const isCurrent = user && user.plan && user.plan.toLowerCase() === plan.id;
                                        return (
                                            <div key={plan.name} className="upgrade-plan-card" style={isCurrent ? { border: '3px solid var(--yellow)', boxShadow: '5px 5px 0 var(--yellow)' } : {}}>
                                                <h4 className="plan-card-name">{plan.name}</h4>
                                                <div className="plan-card-price">{plan.price}</div>
                                                <div className="plan-features">
                                                    {plan.features.map((feature) => (
                                                        <div key={feature} className="feature-item">
                                                            <span className="feature-check">✓</span>
                                                            <span>{feature}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                                {isCurrent ? (
                                                    <button
                                                        className="btn"
                                                        style={{ marginTop: '16px', width: '100%' }}
                                                        onClick={async () => {
                                                            try {
                                                                const res = await fetch('/api/stripe/portal', { method: 'POST', credentials: 'include' });
                                                                const data = await res.json();
                                                                if (data.url) window.location.href = data.url;
                                                                else alert(data.error || 'Could not open billing portal');
                                                            } catch (e) { alert('Error: ' + e.message); }
                                                        }}
                                                    >
                                                        Manage Plan
                                                    </button>
                                                ) : plan.id === 'free' ? (
                                                    <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>Free forever</div>
                                                ) : (
                                                    <button
                                                        className="btn btn-primary"
                                                        style={{ marginTop: '16px', width: '100%' }}
                                                        onClick={async () => {
                                                            try {
                                                                const res = await fetch('/api/stripe/checkout', {
                                                                    method: 'POST',
                                                                    headers: { 'Content-Type': 'application/json' },
                                                                    credentials: 'include',
                                                                    body: JSON.stringify({ plan: plan.id, interval: 'month' }),
                                                                });
                                                                const data = await res.json();
                                                                if (data.url) window.location.href = data.url;
                                                                else alert(data.error || 'Could not start checkout');
                                                            } catch (e) { alert('Error: ' + e.message); }
                                                        }}
                                                    >
                                                        {t('upgrade') || 'Upgrade'}
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* SETTINGS MODAL */}
                    {activeModal === 'settings' && (
                        <div className="modal-overlay active" onClick={() => setActiveModal(null)}>
                            <div className="modal" onClick={(e) => e.stopPropagation()}>
                                <button className="modal-close-btn" onClick={() => setActiveModal(null)}>✕</button>
                                <h2 className="modal-title">{t('profileSettings')}</h2>

                                <form className="modal-form" onSubmit={async (e) => {
                                    e.preventDefault();
                                    // Collect changed fields and persist via PATCH /api/auth/profile.
                                    // Dirty-check first: skip the network round-trip when nothing changed.
                                    // The settings modal is opened from the avatar menu — a frequent path —
                                    // so a no-op save on every visit was wasteful.
                                    try {
                                        const form = e.currentTarget;
                                        // initialSettingsRef was captured when the modal opened;
                                        // fall back to current user only on the first-render edge case
                                        // (e.g., user logged in mid-modal, very rare).
                                        const initial = initialSettingsRef.current || {
                                            name: (user && user.name) || '',
                                            kindle_email: (user && user.kindle_email) || '',
                                            auto_tag_enabled: user ? user.auto_tag_enabled !== false : true,
                                        };
                                        const initialName = initial.name;
                                        const initialKindle = initial.kindle_email;
                                        const initialAutoTag = initial.auto_tag_enabled;
                                        const nextName = (form.elements['settings-name']?.value || '').trim();
                                        const nextKindle = (form.elements['settings-kindle']?.value || '').trim();
                                        // Read the live (post-toggle) value from `user`.
                                        const nextAutoTag = user ? user.auto_tag_enabled !== false : true;

                                        const dirty =
                                            nextName !== initialName ||
                                            nextKindle !== initialKindle ||
                                            nextAutoTag !== initialAutoTag;

                                        if (!dirty) {
                                            setActiveModal(null);
                                            return;
                                        }

                                        const payload = {
                                            name: nextName,
                                            kindle_email: nextKindle || null,
                                            auto_tag_enabled: nextAutoTag,
                                        };
                                        const res = await fetch('/api/auth/profile', {
                                            method: 'PATCH',
                                            credentials: 'include',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify(payload),
                                        });
                                        if (res.ok) {
                                            const j = await res.json();
                                            if (j && j.user) setUser(j.user);
                                        } else {
                                            console.warn('[brevis] profile save failed:', res.status);
                                            // Surface failure to the user instead of silently swallowing
                                            // — they pressed Save expecting something to happen.
                                            alert(t('error') || 'Save failed. Please try again.');
                                        }
                                    } catch (err) {
                                        console.error('[brevis] profile save error:', err);
                                        alert(t('error') || 'Save failed. Please try again.');
                                    }
                                    setActiveModal(null);
                                }}>
                                    <div className="form-group">
                                        <label className="form-label">{t('name')}</label>
                                        <input name="settings-name" type="text" className="form-input" defaultValue={(user && user.name) || ''} />
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">{t('email')}</label>
                                        <input type="email" className="form-input" defaultValue={(user && user.email) || ''} readOnly style={{ opacity: 0.7 }} />
                                    </div>

                                    {user && user.email_code && (
                                        <div className="form-group">
                                            <label className="form-label">Your forwarding address</label>
                                            <div className="form-input" style={{ background: 'var(--yellow)', fontFamily: "'Space Mono', monospace", fontSize: '13px', cursor: 'pointer' }}
                                                 onClick={() => { navigator.clipboard.writeText(user.email_code + '@' + emailDomain); alert('Copied!'); }}>
                                                {user.email_code}@{emailDomain}
                                            </div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Click to copy. Forward any newsletter here to add it to Brevis.</div>
                                        </div>
                                    )}

                                    <div className="form-group">
                                        <label className="form-label">{t('kindleEmail')}</label>
                                        <input name="settings-kindle" type="email" className="form-input" defaultValue={(user && user.kindle_email) || ''} placeholder="your-name@kindle.com" />
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">{t('language')}</label>
                                        <select className="form-input" value={language} onChange={(e) => setLanguage(e.target.value)}>
                                            <option value="en">English</option>
                                            <option value="es">Español</option>
                                        </select>
                                    </div>

                                    {/* Auto-tagging toggle: controlled from user state and sent on save. */}
                                    <div className="form-group">
                                        <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                                            <input
                                                type="checkbox"
                                                checked={user ? user.auto_tag_enabled !== false : true}
                                                onChange={(ev) => setUser(prev => prev ? { ...prev, auto_tag_enabled: ev.target.checked } : prev)}
                                            />
                                            <span>{t('autoTagLabel')}</span>
                                        </label>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', marginLeft: '24px', lineHeight: 1.4 }}>
                                            {t('autoTagHelp')}
                                        </div>
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">Plan</label>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <div className="plan-badge" style={{ margin: 0 }}>{(user && user.plan) ? user.plan.toUpperCase() : 'FREE'}</div>
                                            <button type="button" className="btn" onClick={() => setActiveModal('upgrade')} style={{ fontSize: '12px' }}>
                                                Change Plan
                                            </button>
                                        </div>
                                    </div>

                                    <button type="submit" className="btn btn-primary">
                                        {t('save') || 'Save'}
                                    </button>
                                </form>
                            </div>
                        </div>
                    )}

                    {/* FILTER MODAL */}
                    {activeModal === 'filter' && (
                        <div className="modal-overlay active" onClick={() => setActiveModal(null)}>
                            <div className="modal" onClick={(e) => e.stopPropagation()}>
                                <button className="modal-close-btn" onClick={() => setActiveModal(null)}>✕</button>
                                <h2 className="modal-title">Filter Options</h2>

                                <form className="modal-form">
                                    <div className="form-group">
                                        <label className="form-label">By Tags</label>
                                        {tags.map(tag => (
                                            <label key={tag.name} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={filterTags.includes(tag.name)}
                                                    onChange={() => setFilterTags(prev =>
                                                        prev.includes(tag.name)
                                                            ? prev.filter(t => t !== tag.name)
                                                            : [...prev, tag.name]
                                                    )}
                                                />
                                                <div className="tag-dot" style={{ backgroundColor: tag.color, width: '10px', height: '10px' }}></div>
                                                {tag.name}
                                            </label>
                                        ))}
                                    </div>

                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button type="button" className="btn btn-primary" onClick={() => setActiveModal(null)} style={{ flex: 1 }}>
                                            Apply Filters
                                        </button>
                                        {filterTags.length > 0 && (
                                            <button type="button" className="btn" onClick={() => { setFilterTags([]); setActiveModal(null); }}>
                                                Clear
                                            </button>
                                        )}
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}
                </>
            );
        }

        // ERROR BOUNDARY — catches any crash in the component tree so the
        // user sees something instead of a blank page, and logs to console.
        class ErrorBoundary extends React.Component {
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

        // RENDER
        function Root() {
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

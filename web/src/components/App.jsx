// Moved verbatim from the former single-module web/src/main.jsx (step B of the
// 2026-06 frontend migration). Logic unchanged; only imports/exports added.
import { useState, useEffect, useRef, useCallback } from 'react';
import DOMPurify from 'dompurify';
import { t, translations } from '../i18n.js';
import { BRLogo } from './BRLogo.jsx';
import { normalizeNewsletter, formatSummaryHTML } from '../utils/newsletters.js';
import { SummaryToggle } from './SummaryToggle.jsx';

export function App() {
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
            const [importTab, setImportTab] = useState('url'); // 'url' | 'pdf' | 'manual'
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
                    setImportTab('url');
                }
            }, [activeModal]);

            // Shared by the three import forms: prepend the created newsletter and
            // close the modal. De-dupe by id: if a background refetch already pulled
            // this newsletter into the list while the request was in-flight, the
            // second copy would warn about duplicate keys in React.
            const finishImport = (created) => {
                const normalized = normalizeNewsletter(created.newsletter || created);
                setNewsletters(prev => [normalized, ...prev.filter(n => n.id !== normalized.id)]);
                setActiveModal(null);
            };

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
                        headers: { 'Content-Type': 'application/json' },
                        // Ask for the summary in the language the user is viewing.
                        // The backend translates a cached summary (cheap) rather
                        // than regenerating when only the language differs.
                        body: JSON.stringify({ language }),
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
                    const patch = { summary: data.summary, summary_language: data.language || language };
                    setNewsletters(prev => prev.map(n => n.id === id ? { ...n, ...patch } : n));
                    setSelectedNewsletter(prev => (prev && prev.id === id) ? { ...prev, ...patch } : prev);
                } catch (err) {
                    console.error('[brevis] generateSummary failed:', err);
                    alert(t('summaryFailed') + ': ' + err.message);
                } finally {
                    setSummarizingIds(prev => { const next = new Set(prev); next.delete(id); return next; });
                }
            };

            // Persist read/unread to the backend and optimistically update the UI.
            // Keeps the existing object (tags etc.) and only flips the read flags.
            const markRead = async (id, isRead) => {
                // Optimistic flip so the UI responds instantly.
                setNewsletters(prev => prev.map(n => n.id === id ? { ...n, isRead, isUnread: !isRead } : n));
                setSelectedNewsletter(prev => (prev && prev.id === id) ? { ...prev, isRead, isUnread: !isRead } : prev);
                try {
                    const res = await fetch(`/api/newsletters/${id}`, {
                        method: 'PATCH',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ is_read: isRead }),
                    });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                } catch (err) {
                    // Roll back the optimistic update on failure.
                    console.error('[brevis] markRead failed:', err);
                    setNewsletters(prev => prev.map(n => n.id === id ? { ...n, isRead: !isRead, isUnread: isRead } : n));
                    setSelectedNewsletter(prev => (prev && prev.id === id) ? { ...prev, isRead: !isRead, isUnread: isRead } : prev);
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
                                <button
                                    className="btn"
                                    style={{ background: 'var(--bg-cream)' }}
                                    onClick={() => {
                                        selectedItems.forEach(id => markRead(id, true));
                                        setSelectedItems([]);
                                        setSelectionMode(false);
                                    }}
                                >
                                    ✓ {t('markRead')}
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
                                            className={`action-btn ${newsletter.isRead ? 'action-btn--active' : ''}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                markRead(newsletter.id, !newsletter.isRead);
                                            }}
                                            title={newsletter.isRead ? t('markUnread') : t('markRead')}
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
                                    <button
                                        className="btn"
                                        style={{ padding: '8px 12px', fontSize: '12px' }}
                                        onClick={() => markRead(selectedNewsletter.id, !selectedNewsletter.isRead)}
                                    >
                                        ✓ {selectedNewsletter.isRead ? t('markUnread') : t('markRead')}
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
                                    <button className={`modal-tab ${importTab === 'url' ? 'active' : ''}`} onClick={() => { setImportTab('url'); setImportError(null); }}>{t('url')}</button>
                                    <button className={`modal-tab ${importTab === 'pdf' ? 'active' : ''}`} onClick={() => { setImportTab('pdf'); setImportError(null); }}>{t('pdf')}</button>
                                    <button className={`modal-tab ${importTab === 'manual' ? 'active' : ''}`} onClick={() => { setImportTab('manual'); setImportError(null); }}>{t('manual')}</button>
                                </div>

                                {importTab === 'url' && (
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
                                        finishImport(created);
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
                                )}

                                {importTab === 'pdf' && (
                                <form className="modal-form" onSubmit={async (e) => {
                                    e.preventDefault();
                                    if (importing) return;
                                    const file = e.target.elements.file.files[0];
                                    if (!file) return;
                                    // Server enforces both too (src/routes/newsletters.js);
                                    // checking here saves uploading 10MB just to get a 400.
                                    if (file.type !== 'application/pdf') {
                                        setImportError('Only PDF files are supported');
                                        return;
                                    }
                                    if (file.size > 10 * 1024 * 1024) {
                                        setImportError('File too large (max 10MB)');
                                        return;
                                    }
                                    setImporting(true);
                                    setImportError(null);
                                    try {
                                        const formData = new FormData();
                                        formData.append('file', file);
                                        const res = await fetch('/api/newsletters/upload-pdf', {
                                            method: 'POST',
                                            credentials: 'include',
                                            body: formData,
                                        });
                                        if (!res.ok) {
                                            const errBody = await res.json().catch(() => ({}));
                                            throw new Error(errBody.error || `Upload failed (${res.status})`);
                                        }
                                        const created = await res.json();
                                        finishImport(created);
                                    } catch (err) {
                                        console.error('[brevis] PDF upload failed:', err);
                                        setImportError(err.message || 'Upload failed');
                                    } finally {
                                        setImporting(false);
                                    }
                                }}>
                                    <div className="form-group">
                                        <label className="form-label">{t('pdfFile')}</label>
                                        <input name="file" type="file" accept="application/pdf,.pdf" className="form-input" required disabled={importing} />
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
                                )}

                                {importTab === 'manual' && (
                                <form className="modal-form" onSubmit={async (e) => {
                                    e.preventDefault();
                                    if (importing) return;
                                    const title = (e.target.elements.title.value || '').trim();
                                    const source = (e.target.elements.source.value || '').trim();
                                    const content = (e.target.elements.content.value || '').trim();
                                    if (!title || !content) return;
                                    setImporting(true);
                                    setImportError(null);
                                    try {
                                        const res = await fetch('/api/newsletters', {
                                            method: 'POST',
                                            credentials: 'include',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ title, source, content }),
                                        });
                                        if (!res.ok) {
                                            const errBody = await res.json().catch(() => ({}));
                                            throw new Error(errBody.error || `Save failed (${res.status})`);
                                        }
                                        const created = await res.json();
                                        finishImport(created);
                                    } catch (err) {
                                        console.error('[brevis] manual create failed:', err);
                                        setImportError(err.message || 'Save failed');
                                    } finally {
                                        setImporting(false);
                                    }
                                }}>
                                    <div className="form-group">
                                        <label className="form-label">{t('title')}</label>
                                        <input name="title" type="text" className="form-input" maxLength="500" required disabled={importing} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">{t('source')}</label>
                                        <input name="source" type="text" className="form-input" maxLength="255" disabled={importing} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">{t('content')}</label>
                                        <textarea name="content" className="form-input" rows="8" required disabled={importing} />
                                    </div>
                                    {importError && (
                                        <div className="form-error" style={{ color: 'var(--accent-red, #c0392b)', fontSize: '13px', marginBottom: '12px', padding: '8px 12px', background: 'rgba(192,57,43,0.08)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: '8px' }}>
                                            {importError}
                                        </div>
                                    )}
                                    <button type="submit" className="btn btn-primary" disabled={importing}>
                                        {importing ? 'Saving…' : t('save')}
                                    </button>
                                </form>
                                )}
                            </div>
                        </div>
                    )}

                    {/* KNOWLEDGE GRAPH MODAL */}
                    {activeModal === 'graph' && (
                        <div className="modal-overlay active" onClick={() => setActiveModal(null)}>
                            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '1000px', maxHeight: '90vh' }}>
                                <button className="modal-close-btn" onClick={() => setActiveModal(null)}>✕</button>
                                <h2 className="modal-title">{t('knowledgeGraph')}</h2>

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

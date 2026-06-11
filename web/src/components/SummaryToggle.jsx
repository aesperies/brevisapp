// Moved verbatim from the former single-module web/src/main.jsx (step B of the
// 2026-06 frontend migration). Logic unchanged; only imports/exports added.
import { useState } from 'react';
import DOMPurify from 'dompurify';
import { formatSummaryHTML } from '../utils/newsletters.js';

export function SummaryToggle({ summary }) {
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

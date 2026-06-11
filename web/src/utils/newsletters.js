// Moved verbatim from the former single-module web/src/main.jsx (step B of the
// 2026-06 frontend migration). Logic unchanged; only imports/exports added.

export function normalizeNewsletter(n) {
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
export function formatSummaryHTML(raw) {
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

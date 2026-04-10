# Lessons Learned

<!-- Add entries here after corrections from the user -->
<!-- Format: - **[Date] Topic**: What happened, what to do differently -->

- **[2026-04-10] Dead CTA buttons shipped to prod**: The landing page's `.btn-primary / .btn-secondary / .btn-cta` handlers contained a `console.log('Button clicked', ...)` stub with the comment `"For now, just log (in production, these would navigate)"`. It shipped. Login link also had `href="#"`. Blog/terms/privacy pages pointed to `/login` which is not a route (server only serves `/app.html`). **Rule**: any time I ship a marketing/landing page, I must verify every interactive element has a real destination. Grep for `href="#"`, `console.log`, `// TODO`, and "for now" in any template before marking it done. Also: never use bare `<button>` for nav/CTA links — use `<a>` so broken JS still routes.

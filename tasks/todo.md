# Brevis - Production Readiness Roadmap

## Completed

### Error Handling & Edge Cases (Feb 2026)
- [x] Global Express error middleware (catches all unhandled errors)
- [x] AppError class for operational vs programmer error distinction
- [x] asyncHandler wrapper — all 37 routes converted, zero try/catch boilerplate
- [x] Database pool error handler (prevents crash on DB disconnect)
- [x] Auth error messages fixed (Spanish → English consistency)
- [x] AI error messages sanitized (no internal API details leaked)
- [x] Frontend apiFetch wrapper (handles 401/429/network errors globally)
- [x] JWT expiry mid-session handled (redirects to login with toast)
- [x] React ErrorBoundary (prevents white screen on render errors)
- [x] Core fetch calls migrated to apiFetch (newsletters, tags, subscriptions, AI)
- [x] Structured logging utility (JSON, log levels, auto-redaction)
- [x] Request ID tracking (X-Request-Id header for log tracing)

## Pending

### Quality & Edge Cases
- [ ] Migrate remaining frontend fetch calls to apiFetch
- [ ] State management audit across the whole app
- [ ] Audit empty states consistency across all views

### Auth & Security
- [x] Privacy policy, terms of service *(already exist)*
- [ ] Auth system hardening (shorter JWT expiry, password complexity)
- [ ] Security review (OWASP top 10)

### Infrastructure
- [x] API rate limits *(5 limiters already in place)*
- [ ] Caching strategy (Redis or in-memory)
- [ ] CI/CD pipeline
- [ ] Performance optimization with real data volumes

### User Experience
- [ ] Push notifications (non-annoying)
- [ ] Offline support
- [ ] Responsive design across screen sizes
- [ ] Testing on older devices/browsers

### Analytics & Growth
- [ ] Analytics to track actual user behavior
- [ ] App Store optimization (screenshots, descriptions, reviews)

### Architecture
- [ ] Split server.js into route modules (currently 2K lines)
- [ ] Split app.html into component files (currently 4.8K lines)
- [ ] Plan for feature requests without architecture rewrites

// Observability: Sentry error tracking + Prometheus metrics + request logging.
// Everything here is inert without configuration: Sentry only activates when
// SENTRY_DSN is set; /metrics only responds when METRICS_TOKEN is set.

import * as Sentry from '@sentry/node';
import client from 'prom-client';
import { log } from './utils/logger.js';

// ============= SENTRY =============

export const sentryEnabled = !!process.env.SENTRY_DSN;

if (sentryEnabled) {
    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.NODE_ENV || 'development',
        // Errors only — perf tracing stays off until we decide we want the quota.
        tracesSampleRate: 0,
        beforeSend(event) {
            // PII scrubbing: never ship cookies, auth headers, or query strings
            // (the email webhook secret can appear in the URL path — drop it too).
            if (event.request) {
                delete event.request.cookies;
                delete event.request.headers;
                delete event.request.query_string;
                if (event.request.url && event.request.url.includes('/api/webhook/email/')) {
                    event.request.url = event.request.url.split('/api/webhook/email/')[0] + '/api/webhook/email/[REDACTED]';
                }
            }
            return event;
        },
    });
    console.log('✅ Sentry error tracking enabled');
} else {
    console.log('⚠️  Sentry disabled (set SENTRY_DSN to enable error tracking)');
}

/** Report an error to Sentry (no-op when disabled). */
export function captureError(err, context = {}) {
    if (!sentryEnabled) return;
    Sentry.withScope((scope) => {
        for (const [k, v] of Object.entries(context)) scope.setTag(k, String(v));
        Sentry.captureException(err);
    });
}

// ============= PROMETHEUS METRICS =============

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

const httpRequestDuration = new client.Histogram({
    name: 'brevis_http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 30],
    registers: [registry],
});

const httpRequestsTotal = new client.Counter({
    name: 'brevis_http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['method', 'route', 'status'],
    registers: [registry],
});

export const backgroundTasksTotal = new client.Counter({
    name: 'brevis_background_tasks_total',
    help: 'Background AI tasks by kind and outcome',
    labelNames: ['kind', 'outcome'],
    registers: [registry],
});

/**
 * Reduce a request path to a low-cardinality metric label: numeric ids and
 * long tokens become ':id' so Prometheus series stay bounded. Non-API paths
 * collapse to 'static'.
 */
export function routeLabel(path) {
    if (!path.startsWith('/api/') && path !== '/health') return 'static';
    if (path.startsWith('/api/webhook/email')) return '/api/webhook/email';
    return path
        .split('/')
        .map((seg) => (/^\d+$/.test(seg) || seg.length > 24 ? ':id' : seg))
        .join('/');
}

// ============= REQUEST INSTRUMENTATION MIDDLEWARE =============

/**
 * One structured log line + metrics per request (brief 3A: request id, user
 * id, duration in every log). Mounted after the request-id middleware.
 */
export function requestInstrumentation(req, res, next) {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
        const durationSec = Number(process.hrtime.bigint() - start) / 1e9;
        const route = routeLabel(req.path);
        httpRequestDuration.observe({ method: req.method, route, status: res.statusCode }, durationSec);
        httpRequestsTotal.inc({ method: req.method, route, status: res.statusCode });
        // Log API traffic only — static asset noise stays out of the logs.
        if (route !== 'static') {
            log.info('request', {
                reqId: req.id,
                userId: req.user?.id,
                method: req.method,
                route,
                status: res.statusCode,
                durationMs: Math.round(durationSec * 1000),
            });
        }
    });
    next();
}

/**
 * GET /metrics handler. Requires METRICS_TOKEN (Bearer) so scrape data is not
 * world-readable; responds 404 when unconfigured to avoid advertising itself.
 */
export async function metricsHandler(req, res) {
    const token = process.env.METRICS_TOKEN;
    if (!token) return res.status(404).json({ error: 'Endpoint not found' });
    if (req.headers.authorization !== `Bearer ${token}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    res.set('Content-Type', registry.contentType);
    res.end(await registry.metrics());
}

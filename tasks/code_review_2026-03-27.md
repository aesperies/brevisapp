# Code Review - Brevis App - 2026-03-27

## ✅ Arreglado desde el último review (2026-03-20)

- **[server.js:1760-1763]** RSS feed sin validación SSRF — **RESUELTO.** `validateUrlForFetch()` ahora se llama antes de `rssParser.parseURL()` en el endpoint de suscripción y en la importación OPML.
- **[server.js:719-721 + database.js:281]** `email_verified` ignorado en Google OAuth — **RESUELTO.** `email_verified` fue añadido a `allowedFields` en `updateUser()`.
- **[server.js:scriptSrc]** `unsafe-eval` en Content Security Policy — **RESUELTO.** Eliminado del CSP; solo permanece `unsafe-inline`.
- **[server.js:929-940]** `fetchGenericContent()` sin timeout HTTP — **RESUELTO.** `AbortController` con 15 segundos correctamente implementado.
- **[server.js:566-570]** `PATCH /api/auth/profile` sin validación — **RESUELTO.** `express-validator` aplicado a todos los campos.
- **[server.js:1828]** `DELETE /api/subscriptions/:id` sin `parseInt()` — **RESUELTO.** Ahora valida `isNaN(id)` y usa `parseInt()`.
- **[server.js:75-110]** SMTP transporter recreado en cada email — **RESUELTO.** `smtpTransporter` se crea una vez al arrancar.
- **[server.js:306]** Inconsistencia en longitud mínima de contraseña — **RESUELTO.** Admin e usuarios regulares ahora usan mínimo 8 caracteres.
- **[server.js:558]** `/api/auth/me` no devolvía `trial_end_date` — **RESUELTO.** Ahora incluido en la respuesta.

---

## CRÍTICO (arreglar esta semana)

### [server.js:1312-1315] — `generate-from-project` fetch de URLs sin timeout

**Problema:** El endpoint `POST /api/news-builder/generate-from-project` hace fetch de URLs externas sin `AbortController` ni timeout. Si uno de los servidores externos tarda indefinidamente, el request handler quedará bloqueado y agotará workers bajo carga concurrente. Este es exactamente el mismo bug que fue corregido en `fetchGenericContent()` la semana pasada, pero que no se aplicó al código de `generate-from-project`.

```js
// Línea 1312-1315 — sin timeout
const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Brevis/1.0)' },
    redirect: 'manual'
});
```

**Solución sugerida:** Aplicar el mismo patrón `AbortController` que ya se usa en `fetchGenericContent()` (líneas 929-940), añadiendo un timeout de 15 segundos antes de cada `fetch()` en el loop de URLs del news builder.

---

### [server.js:1615] — Webhook secret expuesto en URL

**Problema:** El endpoint de webhook de email acepta el secreto como parámetro en la ruta de la URL: `POST /api/webhook/email/:secret?`. Las URLs con credenciales aparecen habitualmente en logs de servidores web, proxies reversos (Railway), CDNs, y herramientas de monitoreo, comprometiendo el secreto. El código también acepta el secreto como query param (`?secret=...`), con el mismo problema.

```js
// Línea 1622 — secret legible en logs del servidor web
const providedSecret = req.params.secret || req.query.secret || req.headers['x-webhook-secret'];
```

**Solución sugerida:** Eliminar el soporte para secret en URL path y query params. Usar exclusivamente el header `x-webhook-secret`, que no aparece en los access logs de HTTP estándar. Actualizar la configuración de SendGrid para que envíe el secreto en ese header.

---

## IMPORTANTE (próximo sprint)

### [database.js:14] — SSL verification deshabilitada en producción *(pendiente desde 2026-03-13)*

**Problema:** `rejectUnauthorized` está configurado como `false` a menos que se active explícitamente `DATABASE_SSL_VERIFY=true`. Esto deja la conexión a la base de datos vulnerable a ataques man-in-the-middle. El comentario indica que es por certificados auto-firmados de Railway, pero Railway sí provee certificados CA válidos.

**Solución sugerida:** Configurar `DATABASE_SSL_VERIFY=true` en las variables de entorno de producción en Railway. Si Railway usa un CA no estándar, obtener el certificado y configurarlo mediante `ssl: { ca: fs.readFileSync('railway-ca.pem') }`.

---

### [auth.js:8-13] — JWT de 30 días sin revocación al cambiar contraseña

**Problema:** Los tokens JWT tienen vigencia de 30 días y no hay mecanismo de invalidación. Si un usuario cambia su contraseña (o si un atacante roba un token), el token antiguo sigue siendo válido durante hasta 30 días. El endpoint `PATCH /api/auth/profile` actualiza el password hash pero no invalida sesiones activas.

```js
// auth.js:9 — 30 días sin revocación posible
{ expiresIn: '30d' }
```

**Solución sugerida:** Opción 1 (simple): acortar el TTL a 7 días y añadir un campo `password_changed_at` en la tabla `users`; en `authMiddleware`, verificar que el token fue emitido después del último cambio de contraseña. Opción 2 (compleja): implementar una lista de tokens revocados en Redis o en la BD. La Opción 1 es más pragmática.

---

### [server.js:1848-1852] — Deduplicación RSS basada en título, no en URL

**Problema:** El cron de RSS evita duplicados comparando `title + sender`. Si el mismo artículo tiene un título ligeramente diferente entre ejecuciones (caracteres HTML, espacios extra, cambios del feed) se insertará duplicado. La columna `url` del artículo RSS (`item.link`) sería un identificador más fiable.

```js
// Línea 1849-1852 — comparación por título puede fallar
const existing = await db.query(
    'SELECT id FROM newsletters WHERE user_id = $1 AND title = $2 AND sender = $3',
    [sub.user_id, item.title || 'Untitled', sender]
);
```

**Solución sugerida:** Cambiar la deduplicación a comparar por `url` cuando `item.link` está disponible: `WHERE user_id = $1 AND url = $2 AND url != ''`. Mantener el fallback por título solo cuando el artículo no tenga URL.

---

### [server.js:1835-1870] — RSS cron sin timeout ni control de concurrencia *(pendiente desde 2026-03-20)*

**Problema:** `fetchAllRSSFeeds()` procesa todos los feeds de todos los usuarios en secuencia sin timeout por feed ni límite de tiempo total. Con muchos usuarios, puede saturar el servidor o solaparse con la siguiente ejecución de `setInterval` (cada 30 min).

**Solución sugerida:** Envolver cada `rssParser.parseURL()` en un `Promise.race()` con un timeout de 10 segundos. Añadir un guard global (variable `isFetchingRSS`) para prevenir ejecuciones solapadas. Con muchos usuarios, considerar procesar en batches de N feeds con `Promise.allSettled()`.

---

### [server.js:1739-1787] — `/api/subscriptions` sin rate limiter *(pendiente desde 2026-03-20)*

**Problema:** Los endpoints de suscripciones (GET, POST, DELETE, import-opml) no tienen rate limiter. Un usuario autenticado puede añadir cientos de feeds RSS rápidamente, incrementando la carga del cron de forma desproporcionada.

**Solución sugerida:** Aplicar `importLimiter` (20 req/15 min) a los endpoints POST de suscripciones, o crear un límite específico para suscripciones.

---

### [nodemailer] — Versión instalada (6.10.1) no coincide con package.json (^8.0.2)

**Problema:** `package.json` especifica `nodemailer: "^8.0.2"` pero `npm outdated` muestra `nodemailer@6.10.1` instalado. Esto significa que `package-lock.json` está desfasado o que `npm install` no se ha ejecutado correctamente. La app funciona porque nodemailer 6.x tiene API compatible, pero no se beneficia de fixes de seguridad de la v8.

**Solución sugerida:** Ejecutar `npm install` en el servidor de producción/deployment pipeline para actualizar a nodemailer 8.x. Verificar que `package-lock.json` se commit en el repo.

---

## MEJORAS SUGERIDAS

- **[ai-service.js]** El nombre del modelo de Claude (`claude-sonnet-4-20250514`) está hardcodeado en 5 lugares distintos. Extraerlo a una constante `const CLAUDE_MODEL = 'claude-sonnet-4-20250514'` al inicio del archivo facilita actualizaciones futuras.
- **[server.js:1629]** El webhook de email loguea `Object.keys(req.body)` y el campo `toEmail` sin enmascarar (`console.log('📬 To:', toEmail)`). Aunque es server-side, es inconsistente con el resto del código que enmascara todos los emails.
- **[server.js:940]** `fetchGenericContent()` usa `redirect: 'manual'` pero luego llama a `response.text()` sin verificar si la respuesta es un redirect (3xx). Esto puede devolver un body vacío sin error visible. Añadir `if (response.status >= 300 && response.status < 400) return null;` antes de `.text()`.
- **Ausencia de tests:** No existe ningún archivo de test en el proyecto. Añadir tests de integración para los endpoints críticos (auth, newsletters, Stripe webhook) reduciría el riesgo de regresiones en cada deploy.

---

## TODOs pendientes en el código

No se encontraron comentarios `TODO`, `FIXME`, `HACK`, o `XXX` en los archivos fuente principales (`server.js`, `database.js`, `auth.js`, `ai-service.js`).

---

## Estado de dependencias

Resultado de `npm outdated` (2026-03-27):

| Paquete | Instalado | Último estable | Prioridad |
|---|---|---|---|
| `stripe` | 14.25.0 | **21.0.1** | 🔴 Alta — salto de 7 versiones mayores, revisar changelog |
| `openai` | 4.104.0 | **6.33.0** | 🔴 Alta — salto de 2 versiones mayores |
| `nodemailer` | 6.10.1 | **8.0.4** | 🔴 Alta — `package.json` ya especifica ^8.0.2, solo ejecutar `npm install` |
| `multer` | 1.4.5-lts.2 | **2.1.1** | 🟡 Media — v2 con mejoras de seguridad, breaking changes |
| `express` | 4.22.1 | **5.2.1** | 🟡 Media — v5 estable, mejora manejo async |
| `bcrypt` | 5.1.1 | **6.0.0** | 🟡 Media — actualización mayor |
| `pdf-parse` | 1.1.4 | **2.4.5** | 🟢 Baja — mejoras de parsing |
| `dotenv` | 16.6.1 | **17.3.1** | 🟢 Baja |
| `helmet` | 7.2.0 | **8.1.0** | 🟢 Baja — mejoras CSP |
| `express-rate-limit` | 7.5.1 | **8.3.1** | 🟢 Baja |
| `mailparser` | 3.9.4 | **3.9.6** | 🟢 Baja — patch update |

**Acción inmediata recomendada:** Ejecutar `npm install` para actualizar `nodemailer` a 8.x (ya declarado en `package.json`). Para `stripe` y `openai`, planificar actualización con revisión de changelogs — posibles breaking changes significativos.

---

## Puntos positivos

- **Gran número de issues resueltos esta semana:** 9 de los 10 hallazgos del review anterior (incluyendo los 2 CRÍTICOS) han sido corregidos correctamente — excelente ritmo de mejora.
- **Protección SSRF completa:** `validateUrlForFetch()` ahora se aplica en todos los endpoints que hacen peticiones externas (importación de URLs, suscripciones RSS, importación OPML). El único punto faltante es el news builder (reportado arriba).
- **CSP reforzada:** La eliminación de `unsafe-eval` mejora significativamente la protección contra XSS.
- **`PATCH /api/auth/profile` ahora validado:** Consistente con el resto de endpoints de auth.
- **Manejo atómico de tokens** (passwords resets, email verification): implementación correcta que previene race conditions.
- **asyncHandler + error middleware centralizado:** Manejo de errores async limpio y consistente en todo el servidor.
- **Rate limiting granular:** Diferentes límites para auth, registro, AI, webhooks e importaciones, bien calibrados.
- **Logging estructurado con redacción de datos sensibles:** Consistente en la mayoría del código.
- **SSRF guard en Google OAuth para access codes:** Uso de cookie `brevis_access_code` en lugar de parámetro de URL es una buena práctica.

---

*Code review automático generado el 2026-03-27. Revisa cada punto antes de hacer cambios.*

# Code Review - Brevis App - 2026-03-20

## ✅ Arreglado desde el último review (2026-03-13)

- **[database.js:289,297]** Columnas eliminadas en `updateUser()` y `upgradePlan()` — RESUELTO. Ahora usan la constante `USER_COLUMNS`.
- **[server.js:294,321]** Código de acceso hardcodeado `'trybrevis14'` — RESUELTO. Ahora usa exclusivamente `process.env.ACCESS_CODE`.

---

## CRÍTICO (arreglar esta semana)

### [server.js:1742] — RSS feed sin validación SSRF

**Problema:** El endpoint `POST /api/subscriptions` llama directamente a `rssParser.parseURL(url)` sin pasar por la función `validateUrlForFetch()` que sí se usa en los endpoints de importación de URL. Un usuario autenticado puede suscribirse a una URL que apunte a una IP privada interna (p.ej. `http://169.254.169.254/latest/meta-data/` en AWS, o `http://192.168.1.1/`), haciendo que el servidor realice peticiones HTTP a su propia infraestructura interna. Esto es una vulnerabilidad SSRF (Server-Side Request Forgery).

El mismo riesgo existe en el cron de RSS (`fetchAllRSSFeeds`, línea 1800): las URLs almacenadas se vuelven a consultar sin validación.

**Solución sugerida:** Añadir `await validateUrlForFetch(url)` antes de llamar a `rssParser.parseURL(url)` tanto en el endpoint de suscripción como en el de importación OPML. Considerar también ejecutar la misma validación en el cron o almacenar un flag `is_validated` en la tabla `subscriptions`.

---

### [server.js:706-708] — `email_verified` nunca se actualiza en Google OAuth

**Problema:** En el callback de Google OAuth, el código intenta marcar al usuario como verificado con `dbHelpers.updateUser(user.id, { email_verified: 1 })`. Sin embargo, `email_verified` **no está en la lista blanca** (`allowedFields`) de `updateUser()` en `database.js`. La función silenciosamente devuelve `null` sin ejecutar ningún UPDATE. El resultado: todos los usuarios de Google OAuth permanecen con `email_verified = 0` en la base de datos, lo que puede disparar el banner de "verifica tu email" en el frontend aunque el email ya esté verificado por Google.

**Solución sugerida:** Añadir `'email_verified'` a la lista `allowedFields` en `database.js:281`, o bien usar una query directa `pool.query('UPDATE users SET email_verified = 1 WHERE id = $1', [id])` en un helper dedicado (como ya existe `updatePasswordHash`).

---

## IMPORTANTE (próximo sprint)

### [server.js:149-161] — `unsafe-eval` en Content Security Policy

**Problema:** La directiva `scriptSrc` del CSP incluye `'unsafe-eval'`, lo que permite que el navegador ejecute código dinámico (`eval()`, `new Function()`, etc.). Esto elimina una capa importante de protección contra ataques XSS que inyecten código. Si ninguna dependencia actualmente requiere `unsafe-eval`, debería eliminarse.

**Solución sugerida:** Eliminar `"'unsafe-eval'"` de `scriptSrc`. Si alguna librería de frontend lo necesita (p.ej. Vue en modo desarrollo, algunas versiones de Handlebars), considerar usar un nonce de CSP o buscar alternativas que no lo requieran en producción.

---

### [server.js:908-946] — `fetchGenericContent()` sin timeout HTTP

**Problema:** La función `fetchGenericContent()` ejecuta `fetch(url, { redirect: 'manual' })` sin timeout. Si un servidor externo tarda mucho o nunca responde, el request handler quedará bloqueado durante un tiempo indefinido, agotando workers de Node.js bajo carga concurrente.

**Solución sugerida:** Añadir un `AbortController` con timeout, como ya se hace correctamente en `anthropicRequest()` en `ai-service.js`. Un timeout de 10-15 segundos es razonable para importación de URLs.

---

### [server.js:562-614] — `PATCH /api/auth/profile` sin validación de inputs

**Problema:** El endpoint de actualización de perfil acepta `name`, `kindle_email` y `language` sin validar su contenido. Esto permite: nombres de longitud arbitraria (sin límite), emails de Kindle con formato inválido, y valores de idioma distintos a `'es'`/`'en'`. No usa `express-validator` (que sí se usa en otros endpoints).

**Solución sugerida:** Añadir validaciones: `body('name').isLength({ max: 255 })`, `body('kindle_email').optional().isEmail()`, `body('language').optional().isIn(['es', 'en'])`.

---

### [server.js:1793-1797] — `DELETE /api/subscriptions/:id` sin `parseInt()`

**Problema:** La query de borrado usa `req.params.id` directamente como parámetro sin convertirlo a entero con `parseInt()`. PostgreSQL normalmente hace el cast automáticamente, pero es una inconsistencia respecto al resto del código y podría causar comportamientos inesperados si el valor no es numérico.

**Solución sugerida:** Cambiar a `parseInt(req.params.id)` y añadir validación `if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' })`, igual que se hace en los endpoints de tags.

---

### [server.js:99-106] — SMTP transporter recreado en cada email *(pendiente desde 2026-03-13)*

**Problema:** La función `sendEmail()` crea un nuevo objeto `nodemailer.createTransport()` cada vez que se llama. Bajo carga esto puede agotar conexiones SMTP.

**Solución sugerida:** Crear el transporter SMTP una sola vez al arrancar el servidor y reutilizarlo.

---

### [server.js:303 vs database.js:175] — Inconsistencia en longitud mínima de contraseña *(pendiente desde 2026-03-13)*

**Problema:** Registro acepta contraseñas de 8 caracteres; el admin inicial requiere 12.

**Solución sugerida:** Unificar a 10-12 caracteres o extraer la constante a un valor compartido.

---

### [database.js:14] — SSL verification deshabilitada en producción *(pendiente desde 2026-03-13)*

**Problema:** `rejectUnauthorized: false` abre la puerta a ataques man-in-the-middle en la conexión a la base de datos.

**Solución sugerida:** Activar `DATABASE_SSL_VERIFY=true` y configurar el certificado CA de Railway.

---

### [server.js:541-558] — `/api/auth/me` no incluye `trial_end_date`

**Problema:** El endpoint `/api/auth/me` no devuelve `trial_end_date` en la respuesta, mientras que los endpoints de login y registro sí lo incluyen. Si el frontend usa `/api/auth/me` para refrescar el estado del usuario (p.ej. al recargar la página), no tendrá la fecha de expiración del trial, lo que puede causar que no se muestre la cuenta regresiva correctamente.

**Solución sugerida:** Añadir `trial_end_date: user.trial_end_date` a la respuesta de `/api/auth/me` para que sea consistente con login y registro.

---

## MEJORAS SUGERIDAS

- **[ai-service.js]** El nombre del modelo de Claude (`claude-sonnet-4-20250514`) está hardcodeado en 5 lugares distintos. Extraerlo a una constante al inicio del archivo o a una variable de entorno `AI_MODEL` facilita actualizar el modelo en el futuro.
- **[server.js:1800-1836]** El cron de RSS no tiene control de concurrencia: procesa todos los feeds de todos los usuarios en secuencia sin timeout por feed ni límite de tiempo total. Con muchos usuarios esto puede saturar el servidor o solaparse con la siguiente ejecución. Añadir un timeout por feed (`AbortController`) y considerar procesamiento en batches.
- **[server.js]** Los endpoints `/api/subscriptions` (GET, POST, DELETE) y `/api/subscriptions/import-opml` no tienen rate limiter. Un usuario podría añadir cientos de feeds RSS rápidamente, generando carga de red desde el cron.
- **Ausencia de tests:** No existe ningún archivo de test en el proyecto. Añadir tests de integración para los endpoints críticos (auth, newsletters, Stripe webhook) reduciría el riesgo de regresiones.
- **[server.js:1607-1608]** El webhook de email loguea `Object.keys(req.body)` y direcciones de email sin enmascarar (`console.log('📬 To:', toEmail)`). Aunque es server-side, es recomendable enmascarar emails también aquí por coherencia con el resto del código.

---

## TODOs pendientes en el código

No se encontraron comentarios `TODO` o `FIXME` explícitos en los archivos fuente principales.

---

## Estado de dependencias

Paquetes con versiones **significativamente desactualizadas** (del resultado de `npm outdated`):

| Paquete | Instalado | Último estable | Riesgo |
|---|---|---|---|
| `stripe` | 14.25.0 | **20.4.1** | Alto — salto de 6 versiones mayores, posibles cambios de API y parches de seguridad |
| `openai` | 4.104.0 | **6.32.0** | Alto — salto de 2 versiones mayores |
| `multer` | 1.4.5-lts.2 | **2.1.1** | Medio — v2 con mejoras de seguridad, pero breaking changes |
| `express` | 4.22.1 | **5.2.1** | Medio — v5 es estable con mejoras de manejo de errores async |
| `helmet` | 7.2.0 | **8.1.0** | Bajo — mejoras de CSP |
| `express-rate-limit` | 7.5.1 | **8.3.1** | Bajo |
| `pdf-parse` | 1.1.4 | **2.4.5** | Bajo |
| `dotenv` | 16.6.1 | **17.3.1** | Bajo |
| `nodemailer` | 6.10.1 | **8.0.3** | Bajo — `package.json` especifica `^8.0.2` pero está instalada v6; correr `npm install` debería actualizar |

**Acción recomendada inmediata:** Correr `npm install` para que `nodemailer` se actualice a 8.x (ya especificado en `package.json`). Para `stripe` y `openai`, planificar actualización con revisión de changelogs (posibles breaking changes).

---

## Puntos positivos

- **Protección SSRF en importación de URLs:** La función `validateUrlForFetch()` con resolución DNS es una implementación correcta y sólida para prevenir SSRF en el endpoint de importación genérica y en el news builder.
- **Manejo atómico de tokens:** Los resets de contraseña y las verificaciones de email usan queries atómicas que marcan el token como usado en el mismo `UPDATE`, previniendo race conditions.
- **Estructura de autenticación robusta:** JWT con secreto obligatorio al arrancar, httpOnly cookies, verificación de firma en el webhook de Stripe, y state CSRF en OAuth.
- **Rate limiting granular:** Diferentes límites para auth, registro, AI y webhooks es una buena práctica implementada correctamente.
- **Logging estructurado con redacción:** El sistema de logs enmascara emails, tokens y contraseñas de forma consistente.
- **asyncHandler:** El wrapper centraliza el manejo de errores async evitando try/catch repetitivos en cada ruta.

---

*Code review automático generado el 2026-03-20. Revisa cada punto antes de hacer cambios.*

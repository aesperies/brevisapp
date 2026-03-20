# Code Review - Brevis App - 2026-03-13

## CRÍTICO (arreglar esta semana)

### [database.js:289] - Columnas eliminadas referenciadas en `updateUser()`
**Problema:** La función `updateUser()` tiene en su cláusula `RETURNING` dos columnas que fueron explícitamente eliminadas de la tabla `users` en la misma migración (`setupDatabase()`): `newsletters_count` y `newsletters_limit`. Esto provoca que PostgreSQL lance un error `column "newsletters_count" does not exist` cada vez que se llame a `updateUser()`, lo que afecta a cualquier actualización de perfil de usuario.

**Solución sugerida:** Reemplazar en la cláusula `RETURNING` de `updateUser()` la lista explícita que incluye `newsletters_count, newsletters_limit` por la constante `USER_COLUMNS` que ya está definida al inicio del archivo y está actualizada.

---

### [database.js:297] - Columnas eliminadas referenciadas en `upgradePlan()`
**Problema:** Igual que el caso anterior, la función `upgradePlan()` tiene el mismo defecto: referencia `newsletters_count` y `newsletters_limit` en su `RETURNING`. Esto hace que la función falle al intentar cambiar el plan de un usuario (p. ej., tras una compra en Stripe).

**Solución sugerida:** Reemplazar la lista explícita por `USER_COLUMNS`, igual que en `updateUser()`.

---

### [server.js:294,321] - Código de acceso hardcodeado en el código fuente
**Problema:** El código de acceso `'trybrevis14'` está escrito directamente en el código fuente en dos lugares: en la validación (`/api/auth/verify-access-code`) y en el registro (`/api/auth/register`). Cualquier persona con acceso al repositorio puede usar este código para registrarse con plan `premium` de forma gratuita. Además, no puede cambiarse sin un nuevo despliegue.

**Solución sugerida:** Eliminar el código hardcodeado. El acceso debe validarse únicamente contra `process.env.ACCESS_CODE`. Si se necesitan múltiples códigos válidos, almacenarlos en una variable de entorno separada o en base de datos.

---

## IMPORTANTE (próximo sprint)

### [database.js:14] - Verificación SSL deshabilitada en producción
**Problema:** En producción, la conexión a PostgreSQL tiene `rejectUnauthorized: false`, lo que deshabilita la verificación del certificado SSL. Aunque está documentado como intencional para Railway, esto abre la puerta a ataques man-in-the-middle en la conexión a la base de datos.

**Solución sugerida:** Configurar el certificado CA de Railway correctamente y activar `DATABASE_SSL_VERIFY=true`, o usar el certificado CA provisto por Railway para verificar la conexión de forma segura.

---

### [server.js:99-104] - SMTP transporter creado en cada email enviado
**Problema:** La función `sendEmail()` crea un nuevo objeto `nodemailer.createTransport()` cada vez que se llama. Bajo carga esto puede ser ineficiente y agotar conexiones. Para SMTP, el transporter debería crearse una sola vez al arrancar el servidor.

**Solución sugerida:** Mover la creación del transporter SMTP fuera de la función `sendEmail()`, creándolo al iniciar la aplicación (igual que se hace con SendGrid).

---

### [server.js:303 vs database.js:175] - Inconsistencia en longitud mínima de contraseña
**Problema:** El registro de usuario acepta contraseñas de mínimo 8 caracteres (`body('password').isLength({ min: 8 })`), pero la creación del usuario administrador inicial exige mínimo 12 caracteres. Esta inconsistencia puede confundir y supone un estándar de seguridad diferente para usuarios y admins.

**Solución sugerida:** Unificar el mínimo a 10-12 caracteres en ambos lugares, o extraer la constante a una variable compartida.

---

### [package.json] - Dependencias con versiones muy desactualizadas
**Problema:** Varias dependencias tienen actualizaciones mayores disponibles que pueden incluir parches de seguridad importantes:

| Paquete | Versión actual | Última versión | Salto |
|---------|---------------|----------------|-------|
| `stripe` | 14.25.0 | 20.4.1 | ⚠️ 6 versiones mayores |
| `nodemailer` | 6.10.1 | 8.0.2 | ⚠️ 2 versiones mayores |
| `express` | 4.22.1 | 5.2.1 | ⚠️ 1 versión mayor |
| `express-rate-limit` | 7.5.1 | 8.3.1 | ⚠️ 1 versión mayor |
| `helmet` | 7.2.0 | 8.1.0 | ⚠️ 1 versión mayor |
| `multer` | 1.4.5-lts.2 | 2.1.1 | ⚠️ 1 versión mayor |
| `bcrypt` | 5.1.1 | 6.0.0 | ⚠️ 1 versión mayor |
| `pdf-parse` | 1.1.4 | 2.4.5 | ⚠️ 1 versión mayor |
| `openai` | 4.104.0 | 6.27.0 | ⚠️ 2 versiones mayores |
| `pg` | 8.17.2 | 8.20.0 | patch |
| `mammoth` | 1.11.0 | 1.12.0 | patch |

**Solución sugerida:** Revisar el changelog de `stripe` (14→20) y `express` (4→5) ya que tienen cambios breaking significativos. Actualizar los patches (`pg`, `mammoth`, `mailparser`) de forma inmediata por ser seguros.

---

### [package.json] - Dependencia `lowdb` instalada pero no usada
**Problema:** `lowdb` está listada en las dependencias pero la aplicación migró a PostgreSQL. Este paquete no se importa en ningún archivo de código fuente.

**Solución sugerida:** Ejecutar `npm uninstall lowdb` para limpiar la dependencia huérfana.

---

## MEJORAS SUGERIDAS

- **Sin suite de tests:** No existe ningún archivo de test (`.test.js`, `.spec.js`, o directorio `__tests__`). Sería muy valioso añadir al menos tests de integración para las rutas críticas: autenticación, webhook de Stripe, y resumen con IA.

- **`ai-service.js` usa `node-fetch` directo en vez del SDK oficial de Anthropic:** El código hace llamadas HTTP manuales a la API de Anthropic. El SDK oficial (`@anthropic-ai/sdk`) simplificaría el código, manejaría reintentos automáticos y facilitaría futuras actualizaciones de la API.

- **`imap` en dependencias pero no visible en código principal:** El paquete `imap` está listado pero no aparece en los imports de `server.js`, `auth.js`, `database.js` o `ai-service.js`. Verificar si se usa en alguna parte o si puede eliminarse.

- **Tamaño de `server.js`:** El archivo `server.js` ocupa ~85KB. Dividirlo en módulos por dominio (auth, newsletters, stripe, email-webhook, rss) mejoraría enormemente la mantenibilidad.

- **`claude-sonnet-4-20250514` hardcodeado en `ai-service.js`:** El nombre del modelo de IA está repetido 5 veces en el mismo archivo. Conviene extraerlo a una constante en la parte superior del archivo para facilitar actualizaciones.

---

## TODOs pendientes en el código

No se encontraron comentarios `TODO`, `FIXME`, `HACK` o `DEPRECATED` en ningún archivo de código fuente. ✅

---

## Puntos positivos

- **Seguridad robusta:** Uso correcto de `helmet`, `cors` configurado con lista blanca de orígenes, `bcrypt` para contraseñas, tokens JWT bien configurados, y `authMiddleware` consistente en todas las rutas protegidas.
- **Manejo de errores bien estructurado:** La clase `AppError` y el wrapper `asyncHandler` están bien implementados y evitan que los errores no capturados tumben el servidor.
- **Logging con redacción de datos sensibles:** El sistema de logs enmascara emails y tokens, lo cual es una buena práctica de privacidad.
- **Rate limiting en todas las rutas sensibles:** Hay limitadores distintos y bien calibrados para auth, registro, IA, imports y webhook.
- **Prevención de race conditions:** La función `findValidPasswordReset()` usa una actualización atómica (`UPDATE ... RETURNING`) para marcar el token como usado, evitando condiciones de carrera.
- **Validación de inputs con `express-validator`:** Las rutas de auth validan y normalizan los datos de entrada.
- **SSL deshabilitado conscientemente y documentado:** El comentario explica el porqué (Railway con certs auto-firmados), aunque debería mejorarse.
- **Pool de conexiones PostgreSQL bien configurado:** Límites de conexiones, timeouts y manejo de errores del pool están presentes.

---
*Code review automático generado el 2026-03-13. Revisa cada punto antes de hacer cambios.*

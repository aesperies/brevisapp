# Configuración de Funciones de Kindle y Audio

## 🎧 Resumen de Funcionalidades

Se han agregado dos nuevas funciones a Brevis:
1. **📖 Enviar a Kindle** - Envía newsletters a tu dispositivo Kindle por email
2. **🔊 Lectura en Audio** - Genera audio con texto-a-voz de tus newsletters

---

## 📦 Paso 1: Instalar Dependencias

Primero, instala las nuevas dependencias:

```bash
npm install
```

Esto instalará:
- `nodemailer` - Para enviar emails a Kindle
- `openai` - Para generación de audio con TTS

---

## 📖 Configurar Envío a Kindle

### 1. Configurar Variables de Entorno

Agrega estas variables a tu archivo `.env`:

```bash
# SMTP para envío de emails (ejemplo con Gmail)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu-email@gmail.com
SMTP_PASSWORD=tu-contraseña-de-aplicación
SMTP_FROM=tu-email@gmail.com
```

### 2. Obtener Contraseña de Aplicación de Gmail

Si usas Gmail, necesitas una **Contraseña de Aplicación**:

1. Ve a https://myaccount.google.com/security
2. Activa "Verificación en 2 pasos" si no la tienes
3. Ve a "Contraseñas de aplicaciones"
4. Selecciona "Correo" y "Otro (nombre personalizado)"
5. Dale nombre "Brevis Kindle"
6. Copia la contraseña generada y úsala en `SMTP_PASSWORD`

### 3. Configurar Email de Kindle

Los usuarios necesitan agregar su email de Kindle en su perfil:

1. Obtén tu email Kindle:
   - Ve a https://www.amazon.com/hz/mycd/digital-console/devicedetails
   - O en tu Kindle: Configuración → Tu cuenta → Email del dispositivo
   - Será algo como: `tu-nombre_123@kindle.com`

2. Autoriza el email de envío en Amazon:
   - Ve a https://www.amazon.com/hz/mycd/myx#/home/settings/payment
   - En "Personal Document Settings"
   - Agrega `tu-email@gmail.com` (el que usaste en SMTP_USER) a la lista de emails aprobados

3. Los usuarios lo configuran en su perfil de Brevis (próximo paso en el frontend)

### Otros Proveedores SMTP

**SendGrid:**
```bash
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=tu-api-key-de-sendgrid
SMTP_FROM=tu-email-verificado@tudominio.com
```

**Mailgun:**
```bash
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=postmaster@tudominio.mailgun.org
SMTP_PASSWORD=tu-password-mailgun
SMTP_FROM=noreply@tudominio.com
```

---

## 🔊 Configurar Generación de Audio

### 1. Obtener API Key de OpenAI

1. Ve a https://platform.openai.com/api-keys
2. Crea una cuenta si no tienes
3. Crea una nueva API Key
4. Copia la key

### 2. Configurar Variable de Entorno

Agrega a tu `.env`:

```bash
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 3. Costos de OpenAI TTS

- Modelo `tts-1`: $0.015 por 1,000 caracteres (~$0.06 por newsletter de 4,000 chars)
- Límite por newsletter: 4,000 caracteres para mantener costos bajos
- Solo usuarios Pro y Premium pueden generar audio

### 4. Voces Disponibles

El sistema usa automáticamente:
- **Español**: Voz "Nova"
- **Inglés**: Voz "Alloy"

Puedes cambiar las voces en `server.js` línea ~440:
```javascript
voice: user.language === 'es' ? 'nova' : 'alloy',
```

Voces disponibles: `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`

---

## 🧪 Probar las Funciones

### Probar Kindle

```bash
# Inicia el servidor
npm start

# En tu app, configura tu email Kindle en el perfil
# Luego usa el botón ⋯ → "Enviar a Kindle" en cualquier newsletter
```

Verifica:
1. Email recibido en tu Kindle
2. Logs del servidor: `✅ Newsletter X sent to Kindle: email@kindle.com`

### Probar Audio

```bash
# Asegúrate de tener OPENAI_API_KEY configurado
npm start

# En tu app, usa el botón ⋯ → "Lectura en audio"
# Se abrirá una nueva pestaña con el audio o descargará un archivo
```

Verifica:
1. Audio se reproduce correctamente
2. Logs del servidor: `✅ Audio generated for newsletter X`

---

## 🐛 Troubleshooting

### Kindle no recibe emails

1. **Verifica que el email esté autorizado en Amazon**
   - https://www.amazon.com/hz/mycd/myx#/home/settings/payment
   - "Personal Document Settings" → "Approved Personal Document Email List"

2. **Verifica credenciales SMTP**
   ```bash
   # Prueba manual con nodemailer test
   node -e "require('nodemailer').createTransport({host:'smtp.gmail.com',port:587,auth:{user:'tu-email@gmail.com',pass:'tu-password'}}).verify().then(console.log).catch(console.error)"
   ```

3. **Revisa logs del servidor**
   - Busca errores de SMTP
   - Verifica que `emailTransporter` esté inicializado

### Audio no se genera

1. **Verifica API Key de OpenAI**
   ```bash
   curl https://api.openai.com/v1/models \
     -H "Authorization: Bearer $OPENAI_API_KEY"
   ```

2. **Verifica créditos en OpenAI**
   - https://platform.openai.com/account/billing/overview

3. **Límites de tamaño**
   - Máximo 4,096 caracteres por request
   - El código limita a 4,000 automáticamente

### Errores comunes

**"Email service not configured"**
- Falta configuración SMTP en `.env`
- Verifica variables: SMTP_HOST, SMTP_USER, SMTP_PASSWORD

**"Audio service not configured"**
- Falta OPENAI_API_KEY en `.env`

**"Kindle email not configured"**
- Usuario no ha configurado su email Kindle en perfil

---

## 📝 Siguiente Paso: Frontend

Necesitas actualizar el frontend para permitir a los usuarios:

1. **Configurar email Kindle en su perfil**:
   - Agregar campo de input en `ProfileModal`
   - Llamar a `PATCH /api/auth/profile` con `kindle_email`

2. Las funciones de menú ya están implementadas en el frontend actual

---

## 🔐 Seguridad

- **SMTP Credentials**: Nunca subas credenciales al repositorio
- **API Keys**: Usa variables de entorno, nunca hardcodees
- **Kindle emails**: Solo el propietario puede configurar su email
- **Rate limiting**: Considera agregar límites para evitar spam

---

## 📊 Monitoreo

Logs importantes a observar:

```bash
✅ Email transporter configured for Kindle
✅ OpenAI configured for audio generation
✅ Newsletter X sent to Kindle: email@kindle.com
✅ Audio generated for newsletter X
❌ Send to Kindle error: [error details]
❌ Generate audio error: [error details]
```

---

## 💰 Costos Estimados

### OpenAI TTS
- Por newsletter (~2,000 chars): ~$0.03
- 100 audios/mes: ~$3.00
- 1,000 audios/mes: ~$30.00

### Email (SMTP)
- Gmail: Gratis (hasta 500/día)
- SendGrid: $14.95/mes (40,000 emails)
- Mailgun: $35/mes (50,000 emails)

---

## ✅ Checklist de Implementación

Backend (✅ Completado):
- [x] Agregar endpoints `/api/newsletters/:id/kindle`
- [x] Agregar endpoint `/api/newsletters/:id/audio`
- [x] Agregar endpoint `/api/auth/profile`
- [x] Configurar nodemailer
- [x] Configurar OpenAI
- [x] Actualizar base de datos con `kindle_email`

Frontend (⏳ Pendiente):
- [ ] Agregar campo `kindle_email` en ProfileModal
- [ ] Conectar con endpoint PATCH `/api/auth/profile`
- [ ] (Los botones de menú ya están implementados)

Configuración (⏳ Pendiente):
- [ ] Configurar variables de entorno en producción
- [ ] Obtener contraseña de aplicación Gmail / SMTP
- [ ] Obtener API Key de OpenAI
- [ ] Documentar proceso para usuarios finales

---

¿Preguntas? Revisa los logs del servidor o contacta al equipo de desarrollo.

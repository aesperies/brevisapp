# Guía de Configuración de Stripe para BREVIS

Esta guía te ayudará a configurar Stripe para aceptar pagos en tu aplicación BREVIS. Aunque está escrita de manera técnica, puedes pedirle ayuda a alguien técnico si necesitas asistencia.

## Paso 1: Obtener tu Stripe Secret Key

1. Abre la [Stripe Dashboard](https://dashboard.stripe.com)
2. Inicia sesión con tu cuenta de Stripe
3. En el menú izquierdo, busca y haz clic en **Developers** (Desarrolladores)
4. Haz clic en **API Keys** (Claves API)
5. Encontrarás dos claves:
   - **Publishable key** (Clave publicable) - inicio con `pk_`
   - **Secret key** (Clave secreta) - comienza con `sk_`
6. Copia tu **Secret Key**. La necesitarás en el Paso 5.
   - Para desarrollo usa `sk_test_...` (claves de prueba)
   - Para producción usa `sk_live_...` (claves en vivo)

**Seguridad:** Nunca compartas tu Secret Key. Sólo debe estar en tu servidor.

---

## Paso 2: Crear los Productos en Stripe

Los productos en Stripe representan lo que vendes (en este caso, planes de suscripción). Necesitas crear dos productos: Standard y Premium.

### Crear el Producto "Standard"

1. En la Dashboard de Stripe, ve al menú izquierdo
2. Haz clic en **Products** (Productos)
3. Haz clic en el botón **+ Add product** (+ Agregar producto)
4. Completa los datos:
   - **Name:** `Standard`
   - **Description:** `Plan Standard - $8 mensuales`
5. En la sección **Pricing**, haz clic en **Add pricing**
   - **Price:** `8` (en dólares)
   - **Currency:** `USD` (Dólar)
   - **Billing period:** `Monthly` (Mensual)
   - Haz clic en **Save product**

Stripe te mostrará el **Price ID** para este producto (comienza con `price_`). **Cópialo y guárdalo**, lo necesitarás en el Paso 5.

### Crear el Producto "Premium"

1. Repite el proceso anterior, pero esta vez con:
   - **Name:** `Premium`
   - **Description:** `Plan Premium - $10 mensuales`
   - **Price:** `10` (en dólares)

Copia también el **Price ID** de este producto.

---

## Paso 3: Obtener los Price IDs

Ya deberías tener dos Price IDs de los productos que creaste:
- **Standard Monthly:** `price_xxxxx...` (para el plan de $8)
- **Premium Monthly:** `price_xxxxx...` (para el plan de $10)

Si necesitas volver a encontrarlos:
1. Ve a **Products** en la Dashboard
2. Haz clic en cada producto
3. En la sección **Pricing**, verás el Price ID

---

## Paso 4: Configurar el Webhook de Stripe

Un webhook es una forma que Stripe tiene de decirle a tu aplicación cuándo algo importante ocurre (como cuando alguien se suscribe o su pago falla).

1. En la Dashboard de Stripe, ve a **Developers** → **Webhooks** (Webhooks)
2. Haz clic en **+ Add endpoint** (+ Agregar endpoint)
3. En el campo **Endpoint URL**, ingresa:
   ```
   https://brevisapp.com/api/stripe/webhook
   ```
4. En la sección **Events to send**, selecciona los siguientes eventos:
   - `checkout.session.completed` (Sesión de pago completada)
   - `customer.subscription.updated` (Suscripción actualizada)
   - `customer.subscription.deleted` (Suscripción cancelada)
   - `invoice.payment_failed` (Pago fallido)
5. Haz clic en **Add endpoint**
6. Stripe generará un **Webhook Signing Secret** (comienza con `whsec_`). **Cópialo y guárdalo**, lo necesitarás en el Paso 5.

---

## Paso 5: Configurar las Variables de Entorno en Railway

Ahora necesitas agregar tus claves de Stripe a tu aplicación en Railway.

### En la Dashboard de Railway:

1. Abre tu proyecto de BREVIS en [Railway](https://railway.app)
2. Ve a la pestaña **Variables**
3. Agrega las siguientes variables con los valores que copiaste anteriormente:

```
STRIPE_SECRET_KEY = sk_live_xxxxx...
STRIPE_PRICE_PRO_MONTHLY = price_xxxxx... (tu Price ID de Standard)
STRIPE_PRICE_PREMIUM_MONTHLY = price_xxxxx... (tu Price ID de Premium)
STRIPE_WEBHOOK_SECRET = whsec_xxxxx...
```

**Notas:**
- `STRIPE_PRICE_PRO_ANNUAL` y `STRIPE_PRICE_PREMIUM_ANNUAL` son opcionales (puede dejarlas vacías por ahora si no quieres ofertas anuales)
- Asegúrate de que los valores sean exactos, sin espacios extra al principio o final
- Si usas claves de prueba (`sk_test_`), también necesitas Price IDs de prueba

4. Haz clic en **Deploy** para aplicar los cambios

---

## Resumen de Variables de Entorno

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `STRIPE_SECRET_KEY` | Tu clave secreta de Stripe | `sk_live_51234567890...` |
| `STRIPE_PRICE_PRO_MONTHLY` | Price ID para plan Standard mensual | `price_1A2B3C4D5E6F...` |
| `STRIPE_PRICE_PREMIUM_MONTHLY` | Price ID para plan Premium mensual | `price_2F3G4H5I6J7K...` |
| `STRIPE_WEBHOOK_SECRET` | Secreto para validar webhooks | `whsec_12345678...` |

---

## Verificación de la Configuración

Una vez que hayas completado todos los pasos:

1. Abre tu aplicación BREVIS
2. Intenta hacer una prueba de suscripción
3. Si ves la página de checkout de Stripe, ¡la configuración funciona!
4. Después de completar un pago de prueba, verifica en la Dashboard de Stripe que aparezca la suscripción

---

## Solución de Problemas

**Problema:** Veo el error "Stripe not configured"
- **Solución:** Verifica que `STRIPE_SECRET_KEY` esté configurado correctamente en Railway y que la aplicación se haya redeployado.

**Problema:** El botón de suscripción no funciona
- **Solución:** Verifica que `STRIPE_PRICE_PRO_MONTHLY` y `STRIPE_PRICE_PREMIUM_MONTHLY` sean Price IDs válidos copiados de Stripe.

**Problema:** Stripe rechaza la petición del webhook
- **Solución:** Verifica que la URL del webhook sea exacta: `https://brevisapp.com/api/stripe/webhook`

**Problema:** Los pagos de prueba no aparecen en Stripe
- **Solución:** Asegúrate de que `STRIPE_WEBHOOK_SECRET` sea correcto. Sin esto, los pagos no se registran correctamente.

---

## Características Incluidas

Con esta configuración, tus usuarios obtendrán:
- **14 días de prueba gratis** al suscribirse (configurado automáticamente)
- **Pagos seguros** a través de Stripe
- **Gestión de suscripción** (cambiar plan, cancelar, etc.)
- **Webhooks** para sincronizar cambios de suscripción con tu base de datos

---

¿Necesitas ayuda? Contacta al equipo técnico de BREVIS.

import { Hono } from 'hono'
// Importamos directamente las herramientas oficiales de Bun desde hono/bun
import { upgradeWebSocket, websocket } from 'hono/bun'
import { prisma } from '../lib/prisma'


const app = new Hono()
const VERIFY_TOKEN = 'mi_token_secreto_bf_2026'

// Almacén temporal de conexiones de React en memoria
const clientesReact = new Set<any>()

// Ruta raíz para confirmación de despliegue en navegador o proxy de Railway
app.get('/', (c) => {
  return c.text('🚀 Servidor de Webhooks de la Corporación Benjamín Franklin activo y corriendo en Bun.')
})

/**
 * A. ENDPOINT WEBSOCKET: Manejo avanzado de conexión en tiempo real
 */
app.get(
  '/ws',
  upgradeWebSocket((c) => {
    // Leemos la variable de entorno. Si no existe, dejamos localhost por defecto
    const envOrigins = process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3000'
    
    // Convertimos el string separado por comas en un array limpio de espacios
    const allowedOrigins = envOrigins.split(',').map(origin => origin.trim())

    return {
      // Validamos dinámicamente si el origen del frontend está autorizado
      checkOrigin: (origin) => {
        // En entornos de desarrollo o clientes muy específicos, si origin viene vacío lo permitimos
        if (!origin) return true 
        
        const isAllowed = allowedOrigins.includes(origin)
        if (!isAllowed) {
          console.warn(`⚠️ Intento de conexión bloqueado por CORS desde el origen: ${origin}`)
        }
        return isAllowed
      },

      onOpen(evt, ws) {
        clientesReact.add(ws)
        console.log('💻 Interfaz React conectada exitosamente al WebSocket')
      },

      // Parche obligatorio para que Bun Runtime mantenga viva la conexión pasiva
      onMessage(evt, ws) {
        // Se deja vacío de manera intencional (canal pasivo solo de envío POST -> WS)
      },

      onClose(evt, ws) {
        clientesReact.delete(ws)
        console.log('❌ Interfaz React desconectada del WebSocket')
      },
    }
  })
)

/**
 * B. ENDPOINT GET: Validación inicial de Meta Developers (Handshake)
 */
app.get('/webhook', (c) => {
  const mode = c.req.query('hub.mode')
  const token = c.req.query('hub.verify_token')
  const challenge = c.req.query('hub.challenge')

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('¡Webhook verificado con éxito por Meta!')
    return c.text(challenge || '')
  }
  return c.text('Token inválido', 403)
})

/**
 * C. ENDPOINT POST: Recepción de datos de Click to WhatsApp
 */
app.post('/webhook', async (c) => {
  const body = await c.req.json()

  if (!body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
    return c.text('EVENT_RECEIVED', 200) 
  }

  const valueData = body.entry[0].changes[0].value
  const contact = valueData.contacts[0]
  const message = valueData.messages[0]

  const datosLead = {
    id: message.id || Date.now().toString(),
    nombre: contact.profile.name,
    celular: contact.wa_id,
    mensaje: message.text?.body || '',
    anuncio: message.referral?.headline || 'Mensaje Orgánico (Sin anuncio)'
  }

  // 1. GUARDAMOS EL REGISTRO EN POSTGRESQL USANDO TU CLIENTE PERSONALIZADO
  try {
    // Asegúrate de que el modelo en tu schema.prisma se llame "lead" (en minúscula o según lo hayas definido)
    await prisma.lead.create({
      data: {
        id: datosLead.id,
        nombre: datosLead.nombre,
        celular: datosLead.celular,
        mensaje: datosLead.mensaje,
        anuncio: datosLead.anuncio,
      }
    })
    console.log(`💾 Lead de ${datosLead.nombre} guardado exitosamente en Postgres.`)
  } catch (dbError) {
    console.error('⚠️ Error al registrar el lead en la Base de Datos:', dbError)
  }

  // 2. TRANSMITIMOS A LOS CLIENTES DE REACT EN TIEMPO REAL
  for (const ws of clientesReact) {
    try {
      ws.send(JSON.stringify(datosLead))
    } catch (err) {
      clientesReact.delete(ws)
    }
  }

  return c.text('EVENT_RECEIVED', 200)
})

// EXPORTACIÓN ACTUAL: Mapeo de puertos para Railway y motor WS nativo de Bun
export default {
  port: process.env.PORT || 3000,
  fetch: app.fetch,
  websocket,
}
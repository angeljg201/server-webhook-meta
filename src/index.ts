import { Hono } from 'hono'
// Importamos directamente las herramientas oficiales de Bun desde hono/bun
import { upgradeWebSocket, websocket } from 'hono/bun'

const app = new Hono()
const VERIFY_TOKEN = 'mi_token_secreto_bf_2026'

// Almacén temporal de conexiones de React en memoria
const clientesReact = new Set<any>()

// Ruta raíz para que no aparezca el error de Railway en el navegador
app.get('/', (c) => {
  return c.text('🚀 Servidor de Webhooks de la Corporación Benjamín Franklin activo y corriendo en Bun.')
})

/**
 * A. ENDPOINT WEBSOCKET: Usando la sintaxis actual de la documentación
 */
app.get(
  '/ws',
  upgradeWebSocket((c) => {
    return {
      onOpen(evt, ws) {
        clientesReact.add(ws)
        console.log('💻 Interfaz React conectada al WebSocket')
      },
      onClose(evt, ws) {
        clientesReact.delete(ws)
        console.log('❌ Interfaz React desconectada')
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
    console.log('¡Webhook verificado por Meta!')
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

  // Transmitimos a los clientes de React usando las conexiones del Set
  for (const ws of clientesReact) {
    ws.send(JSON.stringify(datosLead))
  }

  return c.text('EVENT_RECEIVED', 200)
})

// EXPORTACIÓN ACTUAL: Pasamos directamente el objeto websocket importado de hono/bun
export default {
  port: process.env.PORT || 3000,
  fetch: app.fetch,
  websocket, // <--- Aquí inyectas el helper tal como lo pide la documentación oficial
}
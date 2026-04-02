// api/webhook.js
// Recibe notificaciones de MercadoPago, valida el pago,
// guarda en Google Sheet y agrega suscriptor en Acumbamail

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // MP hace GET para verificar que la URL existe
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'webhook activo' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { type, data } = req.body;

    // Solo procesar notificaciones de pago
    if (type !== 'payment') {
      console.log(`Notificación ignorada: tipo "${type}"`);
      return res.status(200).json({ status: 'ignorado', type });
    }

    const paymentId = data?.id;
    if (!paymentId) {
      console.error('Webhook sin payment ID');
      return res.status(400).json({ error: 'Falta payment ID' });
    }

    console.log(`Procesando pago ID: ${paymentId}`);

    // Consultar el estado del pago en la API de MercadoPago
    const paymentResponse = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`
        }
      }
    );

    if (!paymentResponse.ok) {
      console.error(`Error consultando pago ${paymentId}: ${paymentResponse.status}`);
      return res.status(500).json({ error: 'Error al consultar pago en MP' });
    }

    const payment = await paymentResponse.json();
    console.log(`Pago ${paymentId}: status=${payment.status}`);

    // Procesar según el estado del pago
    if (payment.status === 'approved') {
      await saveToGoogleSheet(payment, 'approved');
      await addToAcumbamail(payment);
      return res.status(200).json({ status: 'procesado', payment_status: 'approved' });
    }

    if (payment.status === 'pending' || payment.status === 'in_process') {
      console.log(`Pago ${paymentId} pendiente. Se procesará cuando se acredite.`);
      await saveToGoogleSheet(payment, 'pending');
      return res.status(200).json({ status: 'pendiente', payment_status: payment.status });
    }

    if (payment.status === 'rejected' || payment.status === 'cancelled') {
      console.log(`Pago ${paymentId} rechazado/cancelado: ${payment.status_detail}`);
      await saveToGoogleSheet(payment, payment.status);
      return res.status(200).json({ status: 'rechazado', payment_status: payment.status });
    }

    return res.status(200).json({ status: 'no_manejado', payment_status: payment.status });

  } catch (error) {
    console.error('Error en webhook:', error);
    return res.status(200).json({ error: 'Error interno', detail: error.message });
  }
}

/**
 * Guarda los datos del pago en Google Sheet via Apps Script Web App
 */
async function saveToGoogleSheet(payment, status) {
  const sheetUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL;
  if (!sheetUrl) {
    console.warn('GOOGLE_SHEET_WEBHOOK_URL no configurada, saltando registro en Sheet');
    return;
  }

  // Extraer datos del external_reference
  let refData = {};
  try {
    refData = JSON.parse(payment.external_reference);
  } catch {
    refData = {};
  }

  const payer = payment.payer || {};
  const buyerFirstName = refData.buyer_name || payer.first_name || 'No disponible';
  const buyerLastName = refData.buyer_lastname || payer.last_name || 'No disponible';
  const buyerEmail = refData.buyer_email || payer.email || 'No disponible';
  const buyerPhone = refData.buyer_phone || payer.phone?.number || '';

  const rowData = {
    fecha: new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }),
    estado: status,
    nombre: buyerFirstName,
    apellido: buyerLastName,
    email: buyerEmail,
    telefono: buyerPhone,
    monto: payment.transaction_amount,
    medio_de_pago: payment.payment_type_id || 'N/A',
    id_pago_mp: payment.id,
    evento: refData.event_title || 'N/A'
  };

  try {
    const response = await fetch(sheetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rowData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Error guardando en Google Sheet: ${response.status} - ${errorText}`);
    } else {
      console.log(`📊 Registro guardado en Google Sheet: ${buyerFirstName} ${buyerLastName} - ${status}`);
    }
  } catch (error) {
    console.error('Error al enviar datos al Google Sheet:', error.message);
    // No lanzamos error para no bloquear el flujo del webhook
  }
}

/**
 * Agrega al comprador como suscriptor en la lista de Acumbamail.
 * Se separa el nombre completo en "Primer nombre" y "Segundo nombre"
 * para poder personalizar emails (ej: "Hola Marcela...").
 */
async function addToAcumbamail(payment) {
  const authToken = process.env.ACUMBAMAIL_AUTH_TOKEN;
  const listId = process.env.ACUMBAMAIL_LIST_ID;

  if (!authToken || !listId) {
    console.warn('ACUMBAMAIL_AUTH_TOKEN o ACUMBAMAIL_LIST_ID no configuradas, saltando Acumbamail');
    return;
  }

  // Extraer datos del comprador
  let refData = {};
  try {
    refData = JSON.parse(payment.external_reference);
  } catch {
    refData = {};
  }

  const payer = payment.payer || {};
  const fullName = refData.buyer_name || payer.first_name || '';
  const lastName = refData.buyer_lastname || payer.last_name || '';
  const email = refData.buyer_email || payer.email || '';
  const phone = refData.buyer_phone || payer.phone?.number || '';

  if (!email) {
    console.warn('No hay email del comprador, no se puede agregar a Acumbamail');
    return;
  }

  // Separar primer nombre y segundo nombre
  // Ej: "Marcela Liliana" → primer: "Marcela", segundo: "Liliana"
  // Ej: "Juan" → primer: "Juan", segundo: ""
  const nameParts = fullName.trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const secondName = nameParts.slice(1).join(' ') || '';

  // Construir parámetros como form-data (formato que usa la API de Acumbamail)
  const params = new URLSearchParams();
  params.append('auth_token', authToken);
  params.append('list_id', listId);
  params.append('merge_fields[email]', email);
  params.append('merge_fields[Primer nombre]', firstName);
  params.append('merge_fields[Segundo nombre]', secondName);
  params.append('merge_fields[Apellido]', lastName);
  params.append('merge_fields[Celular]', phone);

  try {
    const response = await fetch('https://acumbamail.com/api/1/addSubscriber/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Error agregando suscriptor a Acumbamail: ${response.status} - ${errorText}`);
    } else {
      console.log(`📧 Suscriptor agregado a Acumbamail: ${firstName} ${lastName} (${email})`);
    }
  } catch (error) {
    console.error('Error al conectar con Acumbamail:', error.message);
    // No lanzamos error para no bloquear el flujo del webhook
  }
}

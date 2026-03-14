// api/webhook.js
// Recibe notificaciones de MercadoPago, valida el pago,
// guarda en Google Sheet y envía email con datos del comprador

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
      await sendNotificationEmail(payment, 'approved');
      return res.status(200).json({ status: 'procesado', payment_status: 'approved' });
    }

    if (payment.status === 'pending' || payment.status === 'in_process') {
      console.log(`Pago ${paymentId} pendiente. Se procesará cuando se acredite.`);
      await saveToGoogleSheet(payment, 'pending');
      await sendNotificationEmail(payment, 'pending');
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
  const buyerFirstName = refData.buyer_name || payer.first_name || '';
  const buyerLastName = refData.buyer_lastname || payer.last_name || '';
  const buyerName = [buyerFirstName, buyerLastName].filter(Boolean).join(' ') || 'No disponible';
  const buyerEmail = refData.buyer_email || payer.email || 'No disponible';
  const buyerPhone = refData.buyer_phone || payer.phone?.number || '';

  const rowData = {
    fecha: new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }),
    estado: status,
    nombre: buyerName,
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
      console.log(`📊 Registro guardado en Google Sheet: ${buyerName} - ${status}`);
    }
  } catch (error) {
    console.error('Error al enviar datos al Google Sheet:', error.message);
    // No lanzamos error para no bloquear el flujo del webhook
  }
}

/**
 * Envía email de notificación con los datos de la compra.
 */
async function sendNotificationEmail(payment, status) {
  let refData = {};
  let eventId = 'N/A';
  let eventTitle = 'N/A';

  try {
    refData = JSON.parse(payment.external_reference);
    eventId = refData.event_id || 'N/A';
    eventTitle = refData.event_title || 'N/A';
  } catch {
    eventId = payment.external_reference || 'N/A';
    eventTitle = payment.additional_info?.items?.[0]?.title || 'N/A';
  }

  const payer = payment.payer || {};
  const buyerFirstName = refData.buyer_name || payer.first_name || '';
  const buyerLastName = refData.buyer_lastname || payer.last_name || '';
  const buyerName = [buyerFirstName, buyerLastName].filter(Boolean).join(' ') || 'No disponible';
  const buyerEmail = refData.buyer_email || payer.email || 'No disponible';
  const buyerPhone = refData.buyer_phone || payer.phone?.number || '';
  const buyerDNI = payer.identification?.number || '';

  const recipientEmails = process.env.NOTIFICATION_EMAILS;
  if (!recipientEmails) {
    console.error('NOTIFICATION_EMAILS no configurada');
    throw new Error('Emails de notificación no configurados');
  }

  const isApproved = status === 'approved';
  const statusLabel = isApproved ? '✅ PAGO APROBADO' : '⏳ PAGO PENDIENTE';
  const statusColor = isApproved ? '#22c55e' : '#f59e0b';

  const subject = isApproved
    ? `✅ Nueva entrada vendida: ${eventTitle} - ${buyerName}`
    : `⏳ Pago pendiente: ${eventTitle} - ${buyerName}`;

  const htmlBody = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: ${statusColor}; color: white; padding: 16px 24px; border-radius: 12px 12px 0 0;">
        <h1 style="margin: 0; font-size: 20px;">🌾 ${statusLabel}</h1>
      </div>
      <div style="background: #f8fafc; padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
        <h2 style="margin-top: 0; color: #334155;">Datos del asistente</h2>
        <p style="color: #64748b; font-size: 13px; margin-top: -10px;">(Ingresados antes del pago)</p>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #64748b; width: 140px;"><strong>Nombre:</strong></td>
            <td style="padding: 8px 0; color: #1e293b;">${buyerName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b;"><strong>Email:</strong></td>
            <td style="padding: 8px 0; color: #1e293b;"><a href="mailto:${buyerEmail}">${buyerEmail}</a></td>
          </tr>
          ${buyerPhone ? `<tr>
            <td style="padding: 8px 0; color: #64748b;"><strong>Teléfono:</strong></td>
            <td style="padding: 8px 0; color: #1e293b;">${buyerPhone}</td>
          </tr>` : ''}
        </table>

        ${buyerDNI ? `
        <h3 style="color: #64748b; font-size: 14px; margin-top: 16px;">Info adicional de MercadoPago</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <tr><td style="padding: 4px 0; color: #94a3b8; width: 140px;">DNI:</td><td style="padding: 4px 0; color: #64748b;">${buyerDNI}</td></tr>
        </table>
        ` : ''}

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 16px 0;">

        <h2 style="color: #334155;">Evento</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #64748b; width: 140px;"><strong>Evento:</strong></td>
            <td style="padding: 8px 0; color: #1e293b; font-weight: bold;">${eventTitle}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b;"><strong>ID Evento:</strong></td>
            <td style="padding: 8px 0; color: #1e293b;">${eventId}</td>
          </tr>
        </table>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 16px 0;">

        <h2 style="color: #334155;">Datos del pago</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #64748b; width: 140px;"><strong>ID Pago MP:</strong></td>
            <td style="padding: 8px 0; color: #1e293b;">${payment.id}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b;"><strong>Monto:</strong></td>
            <td style="padding: 8px 0; color: #1e293b; font-weight: bold;">$${payment.transaction_amount?.toLocaleString('es-AR')}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b;"><strong>Medio de pago:</strong></td>
            <td style="padding: 8px 0; color: #1e293b;">${payment.payment_type_id || 'N/A'}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b;"><strong>Estado:</strong></td>
            <td style="padding: 8px 0; color: ${statusColor}; font-weight: bold;">${payment.status}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b;"><strong>Fecha:</strong></td>
            <td style="padding: 8px 0; color: #1e293b;">${payment.date_approved || payment.date_created || 'N/A'}</td>
          </tr>
        </table>

        ${isApproved ? '<p style="margin-top: 20px; padding: 12px; background: #f0fdf4; border-radius: 8px; color: #166534;">🎟️ <strong>Entrada confirmada.</strong> El asistente ya puede presentarse el día del evento.</p>' : '<p style="margin-top: 20px; padding: 12px; background: #fffbeb; border-radius: 8px; color: #92400e;">⏳ El pago está pendiente de acreditación. Recibirás otro email cuando se confirme.</p>'}
      </div>
    </div>
  `;

  // Enviar email via Resend
  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || 'Experiencia Sin Gluten <onboarding@resend.dev>',
      to: recipientEmails.split(',').map(e => e.trim()),
      subject: subject,
      html: htmlBody
    })
  });

  if (!resendResponse.ok) {
    const errorText = await resendResponse.text();
    console.error(`Error enviando email: ${resendResponse.status} - ${errorText}`);
    throw new Error(`Resend respondió con ${resendResponse.status}`);
  }

  console.log(`📧 Email enviado a ${recipientEmails} - ${subject}`);
}

// api/create-preference.js
// Crea una preferencia de pago en MercadoPago y redirige al Checkout Pro

import { MercadoPagoConfig, Preference } from 'mercadopago';

export default async function handler(req, res) {
    // Soportar tanto GET (redirect desde formulario web) como POST
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    // Obtener parámetros
    const params = req.method === 'GET' ? req.query : req.body;
    const { event_id, event_title, price, name, lastname, email, phone, return_url } = params;

    // Validar campos requeridos
    if (!event_id || !event_title || !price || !name || !email) {
        return res.status(400).json({
            error: 'Faltan campos requeridos',
            required: ['event_id', 'event_title', 'price', 'name', 'email'],
            received: { event_id, event_title, price, name, lastname, email, phone }
        });
    }

    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum <= 0) {
        return res.status(400).json({ error: 'El precio debe ser un número positivo' });
    }

    try {
        // Inicializar SDK de MercadoPago
        const client = new MercadoPagoConfig({
            accessToken: process.env.MP_ACCESS_TOKEN
        });
        const preference = new Preference(client);

        // Guardar TODOS los datos en external_reference
        // Así el webhook puede usar los datos ingresados acá para el email y el Google Sheet
        const externalReference = JSON.stringify({
            event_id,
            event_title,
            buyer_name: name,
            buyer_lastname: lastname || '',
            buyer_email: email,
            buyer_phone: phone || ''
        });

        // Crear preferencia de pago
        const result = await preference.create({
            body: {
                items: [
                    {
                        id: event_id,
                        title: event_title,
                        quantity: 1,
                        unit_price: priceNum,
                        currency_id: 'ARS'
                    }
                ],
                payer: {
                    name: name,
                    surname: lastname || '',
                    email: email
                },
                back_urls: {
                    success: `${process.env.BASE_URL}/api/redirect?to=${encodeURIComponent(process.env.SUCCESS_URL)}`,
                    failure: `${process.env.BASE_URL}/api/redirect?to=${encodeURIComponent(return_url || process.env.FAILURE_URL)}`,
                    pending: `${process.env.BASE_URL}/api/redirect?to=${encodeURIComponent(process.env.PENDING_URL)}`
                },
                auto_return: 'approved',
                notification_url: `${process.env.BASE_URL}/api/webhook`,
                external_reference: externalReference,
                statement_descriptor: 'ESG EVENTO',
                expires: false
            }
        });

        // Redirigir al checkout de MercadoPago
        const checkoutUrl = result.init_point;
        return res.redirect(302, checkoutUrl);

    } catch (error) {
        console.error('Error al crear preferencia:', error);
        return res.status(500).json({
            error: 'Error al crear la preferencia de pago',
            detail: error.message
        });
    }
}

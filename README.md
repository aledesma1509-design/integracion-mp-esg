# 🌾 Integración MercadoPago - Experiencia Sin Gluten

Backend serverless en Vercel para procesar pagos de entradas al evento **Experiencia Sin Gluten** via MercadoPago Checkout Pro.

## Endpoints

| Endpoint | Método | Descripción |
|---|---|---|
| `/api/create-preference` | GET/POST | Crea preferencia de pago y redirige al checkout de MP |
| `/api/webhook` | POST | Recibe notificaciones de MP, guarda en Google Sheet y envía email |
| `/api/redirect` | GET | Limpia URLs de redirección de MP |
| `/api/health` | GET | Health check |

## Flujo de pago

1. El usuario completa el formulario en `/checkout.html`
2. Se crea una preferencia de pago en MercadoPago
3. El usuario paga en el checkout de MP
4. MP notifica via webhook → se guarda en Google Sheet + se envía email
5. El usuario es redirigido a la página de agradecimiento

## Setup

1. Instalar dependencias: `npm install`
2. Copiar `.env.example` a `.env` y completar
3. Deploy a Vercel: `vercel --prod`

## Variables de Entorno

Ver `.env.example` para el listado completo.

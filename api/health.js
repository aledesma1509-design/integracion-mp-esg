// api/health.js
// Health check para verificar que el backend está funcionando

export default function handler(req, res) {
    return res.status(200).json({
        status: 'ok',
        project: 'integracion-mp-esg',
        timestamp: new Date().toISOString(),
        env: {
            mp_configured: !!process.env.MP_ACCESS_TOKEN,
            acumbamail_token_configured: !!process.env.ACUMBAMAIL_AUTH_TOKEN,
            acumbamail_list_configured: !!process.env.ACUMBAMAIL_LIST_ID,
            success_url_configured: !!process.env.SUCCESS_URL,
            google_sheet_configured: !!process.env.GOOGLE_SHEET_WEBHOOK_URL
        }
    });
}

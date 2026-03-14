// api/redirect.js
// Recibe la redirección de MercadoPago (que viene con mucha basura en la URL como collection_id=null),
// la limpia y redirige al usuario a la URL final limpia para que FlexiFunnels no tire error 404.

export default function handler(req, res) {
    try {
        const urlObj = new URL(req.url, `https://${req.headers.host}`);
        const toUrl = urlObj.searchParams.get('to');

        if (!toUrl) {
            console.warn('Redirect llamado sin parámetro "to"');
            return res.redirect(302, process.env.FAILURE_URL || '/');
        }

        return res.redirect(302, toUrl);
    } catch (e) {
        console.error('Error procesando redirect:', e);
        return res.redirect(302, process.env.FAILURE_URL || '/');
    }
}

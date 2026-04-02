// api/test-acumbamail.js
// Endpoint de diagnóstico para verificar la conexión con Acumbamail desde Vercel

export default async function handler(req, res) {
  const authToken = process.env.ACUMBAMAIL_AUTH_TOKEN;
  const listId = process.env.ACUMBAMAIL_LIST_ID;

  // 1. Verificar que las variables de entorno existen
  const diagnostico = {
    paso1_variables: {
      ACUMBAMAIL_AUTH_TOKEN: authToken ? `OK (${authToken.substring(0, 6)}...)` : '❌ NO CONFIGURADA',
      ACUMBAMAIL_LIST_ID: listId || '❌ NO CONFIGURADA'
    }
  };

  if (!authToken || !listId) {
    return res.status(200).json(diagnostico);
  }

  // 2. Intentar agregar un suscriptor de prueba
  const testEmail = `test-vercel-${Date.now()}@test.com`;

  const params = new URLSearchParams();
  params.append('auth_token', authToken);
  params.append('list_id', listId);
  params.append('merge_fields[EMAIL]', testEmail);
  params.append('merge_fields[PRIMERNOMBRE]', 'TestVercel');
  params.append('merge_fields[SEGUNDONOMBRE]', 'Segundo');
  params.append('merge_fields[APELLIDO]', 'Diagnostico');
  params.append('merge_fields[CELULAR]', '1122334455');

  try {
    const response = await fetch('https://acumbamail.com/api/1/addSubscriber/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    const responseText = await response.text();
    diagnostico.paso2_api_call = {
      status: response.status,
      respuesta: responseText,
      email_enviado: testEmail,
      body_enviado: params.toString()
    };
  } catch (error) {
    diagnostico.paso2_api_call = {
      error: error.message
    };
  }

  return res.status(200).json(diagnostico);
}

const authToken = 'cf510a8ae9f140fab56cbae209cdd714';
const listId = '1272901';

async function test1UrlEncoded() {
  const params = new URLSearchParams();
  params.append('auth_token', authToken);
  params.append('list_id', listId);
  params.append('update', '1');
  params.append('merge_fields', JSON.stringify({
    "EMAIL": "test-api1@gmail.com",
    "PRIMERNOMBRE": "Leo",
    "SEGUNDONOMBRE": "Messi",
    "APELLIDO": "Lionel",
    "CELULAR": "11223344"
  }));
  
  const response = await fetch('https://acumbamail.com/api/1/addSubscriber/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  console.log('Test 1 (URL Encoded Stringified JSON):', response.status, await response.text());
}

async function test2UrlEncodedForm() {
  const params = new URLSearchParams();
  params.append('auth_token', authToken);
  params.append('list_id', listId);
  params.append('update', '1');
  params.append('merge_fields[EMAIL]', 'test-api2@gmail.com');
  params.append('merge_fields[PRIMERNOMBRE]', 'Leo');
  
  const response = await fetch('https://acumbamail.com/api/1/addSubscriber/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  console.log('Test 2 (URL Encoded Bracket Syntax):', response.status, await response.text());
}

async function test3FormData() {
  const params = new FormData();
  params.append('auth_token', authToken);
  params.append('list_id', listId);
  params.append('update', '1');
  params.append('merge_fields', JSON.stringify({
    "EMAIL": "test-api3@gmail.com",
    "PRIMERNOMBRE": "Leo",
  }));
  
  const response = await fetch('https://acumbamail.com/api/1/addSubscriber/', {
    method: 'POST',
    body: params
  });
  console.log('Test 3 (FormData Stringified JSON):', response.status, await response.text());
}

async function test4FormData() {
  const params = new FormData();
  params.append('auth_token', authToken);
  params.append('list_id', listId);
  params.append('update', '1');
  params.append('merge_fields[EMAIL]', "test-api4@gmail.com");
  params.append('merge_fields[PRIMERNOMBRE]', "Leo");
  
  const response = await fetch('https://acumbamail.com/api/1/addSubscriber/', {
    method: 'POST',
    body: params
  });
  console.log('Test 4 (FormData Bracket Syntax):', response.status, await response.text());
}

async function run() {
  console.log("Probando la API de Acumbamail...");
  await test1UrlEncoded().catch(console.error);
  await test2UrlEncodedForm().catch(console.error);
  await test3FormData().catch(console.error);
  await test4FormData().catch(console.error);
}

run();

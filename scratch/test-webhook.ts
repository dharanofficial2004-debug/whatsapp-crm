async function testWebhook() {
  const payload = {
    object: 'page',
    entry: [
      {
        id: '774605519061561',
        time: Math.floor(Date.now() / 1000),
        changes: [
          {
            field: 'leadgen',
            value: {
              ad_id: '123',
              form_id: '1560291462372875',
              leadgen_id: '456',
              created_time: Math.floor(Date.now() / 1000),
              page_id: '774605519061561'
            }
          }
        ]
      }
    ]
  };

  try {
    const res = await fetch('http://localhost:3000/api/meta-leads/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Mocking the signature is hard because it needs the app secret.
        // But let's see what it responds with.
      },
      body: JSON.stringify(payload)
    });
    console.log('Status:', res.status);
    console.log('Response:', await res.text());
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

testWebhook();

async function test() {
  const userId = 'f1473c89-31d6-4b2e-9565-fae245a7d960'; // from DB
  const triggerBody = {
    userId,
    triggerType: 'keyword_match',
    contactId: 'b465949b-d2f5-48cd-92ea-c84a5537e0f5',
    context: {
      message_text: 'send details' // matches "send detail" automation
    }
  };

  try {
    const res = await fetch('http://localhost:3000/api/test-automation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(triggerBody)
    });
    console.log('Status:', res.status);
    console.log('Response:', await res.text());
  } catch (err) {
    console.error('Fetch error:', err);
  }
}
test();

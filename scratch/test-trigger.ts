import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Need to mock or use real things, but easier is to just run a quick query.
// Wait, to test runAutomationsForTrigger, I need to call it.
// I will just make a POST request to the local Next.js server!

async function testTrigger() {
  const userId = 'f1473c89-31d6-4b2e-9565-fae245a7d960'; // from DB
  const triggerBody = {
    userId,
    triggerType: 'keyword_match',
    contactId: null, // we don't have a contact ID easily, let's just trigger and see if it fails
    context: {
      message_text: 'hello'
    }
  };

  try {
    const res = await fetch('http://localhost:3000/api/automations/engine', {
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

testTrigger();

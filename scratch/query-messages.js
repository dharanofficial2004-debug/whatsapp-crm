const url = 'https://srzblhyihbfgssjlhxpo.supabase.co/rest/v1/messages?select=created_at,content_text,sender_type&order=created_at.desc&limit=5';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNyemJsaHlpaGJmZ3NzamxoeHBvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTMzODI5MSwiZXhwIjoyMDk0OTE0MjkxfQ.-95SJJKZePOH9O1z3-_5-dwhp9cF6Cr5pGTe9l99dvE';

async function run() {
  try {
    const res = await fetch(url, { headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }});
    console.log(await res.json());
  } catch (err) {}
}
run();

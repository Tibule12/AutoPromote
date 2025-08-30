const fetch = require('node-fetch');

const SUPABASE_URL = 'https://ktmmwvxbhzujphxvycvt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0bW13dnhiaHp1anBoeHZ5Y3Z0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0NTE0MTIsImV4cCI6MjA3MjAyNzQxMn0.xqPnkrXlNv05zJ_BmyY4vXch2DveAgmDfrQ1foYdVLI';

async function addSampleContent() {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/content`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify({
        title: 'Sample Content for Promotion Test',
        type: 'video',
        url: 'https://example.com/sample-video',
        user_id: 'f826ccd4-4f02-40a8-a0fa-c8d90a56fb78', // Replace with valid user ID if needed
        created_at: new Date().toISOString()
      })
    });

    if (response.ok) {
      const data = await response.json();
      console.log('Sample content added:', data);
    } else {
      const errorText = await response.text();
      console.error('Failed to add sample content:', errorText);
    }
  } catch (error) {
    console.error('Error adding sample content:', error);
  }
}

addSampleContent();

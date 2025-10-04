// Quick script to exercise the readiness probe locally
(async () => {
  const base = process.env.API_BASE || 'http://localhost:5000';
  const url = `${base}/api/health/ready`;
  console.log('Checking readiness at', url);
  try {
    const res = await fetch(url);
    const body = await res.json().catch(()=>({ raw: true }));
    console.log('Status Code:', res.status);
    console.log('Response:', JSON.stringify(body, null, 2));
    if (res.ok) console.log('✅ Ready'); else console.log('❌ Not Ready');
  } catch (e) {
    console.error('Error calling readiness endpoint:', e.message);
  }
})();

export default async function handler(req, res) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const url = new URL(req.url, `https://${host}`);

  if (url.pathname === '/' || url.pathname === '/ip' || url.pathname === '/api') {
    try {
      const ipRes = await fetch('https://api.ipify.org?format=json');
      const data = await ipRes.json();
      return res.status(200).json({
        status: 'online',
        message: 'Vercel Serverless Proxy Node is working!',
        node_public_ip: data.ip,
        timestamp: new Date().toISOString()
      });
    } catch (e) {
      return res.status(200).json({
        status: 'online',
        message: 'Vercel Node working, could not query egress IP'
      });
    }
  }

  const target = url.searchParams.get('url') || req.headers['x-target-url'];
  if (target) {
    try {
      const headers = { ...req.headers };
      delete headers['x-forwarded-for'];
      delete headers['x-real-ip'];
      delete headers['via'];
      delete headers['host'];

      const fetchRes = await fetch(target, {
        method: req.method,
        headers: headers,
        body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined
      });

      const body = await fetchRes.text();
      return res.status(fetchRes.status).send(body);
    } catch (err) {
      return res.status(502).send('Proxy Error: ' + err.message);
    }
  }

  return res.status(200).send('Vercel Proxy Node Active');
}

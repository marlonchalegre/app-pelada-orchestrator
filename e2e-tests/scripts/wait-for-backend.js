const http = require('http');

const HEALTH_URL = 'http://localhost:8080/api/health';
const BASE_URL = 'http://localhost:8080/';
const REGISTER_API = 'http://localhost:8080/auth/register';
const MAX_RETRIES = 100;
const INTERVAL = 5000;

async function checkUrl(url, options = {}) {
  return new Promise((resolve) => {
    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        // We consider it up if it's not a 502/503/504
        if (res.statusCode < 500) {
          if (!options.pattern || data.toLowerCase().includes(options.pattern.toLowerCase())) {
            resolve(true);
            return;
          }
        }
        resolve(false);
      });
    });
    
    req.on('error', () => {
      resolve(false);
    });
    
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function wait() {
  console.log('Waiting for services to be ready...');
  for (let i = 0; i < MAX_RETRIES; i++) {
    const backendOk = await checkUrl(HEALTH_URL, { pattern: 'ok' });
    if (backendOk) {
      console.log('Backend is healthy!');
      
      // Test actual registration endpoint to avoid 502
      const authOk = await checkUrl(REGISTER_API, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@test.com' }) // Invalid request but should return 400, not 502
      });
      
      if (authOk) {
        console.log('Auth API is responding!');
        const frontendOk = await checkUrl(BASE_URL, { pattern: 'root' });
        if (frontendOk) {
          console.log('Frontend is up!');
          console.log('Waiting 5 more seconds for stability...');
          await new Promise(r => setTimeout(r, 5000));
          process.exit(0);
        }
      }
    }
    process.stdout.write('.');
    await new Promise(r => setTimeout(r, INTERVAL));
  }
  console.error('\nServices failed to become ready in time.');
  process.exit(1);
}

wait();

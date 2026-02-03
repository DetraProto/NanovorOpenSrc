/**
 * Smoke tests: hit HTTP endpoints and assert expected responses.
 * Expects the server to already be running on http://127.0.0.1:8443
 */

const http = require('http');

const BASE = 'http://127.0.0.1:8443';
const timeout = 5000;

function request(method, path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 8443,
        path: url.pathname + url.search,
        method,
        timeout,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timeout: ${method} ${path}`));
    });
    req.end();
  });
}

async function main() {
  let failed = 0;

  // GET /scws/ ??? shard list (public, no auth)
  try {
    const { status, body } = await request('GET', '/scws/');
    if (status !== 200) {
      console.error('FAIL GET /scws/: expected 200, got', status);
      failed++;
    } else if (!body.includes('<shard-list') || !body.includes('<shard>')) {
      console.error('FAIL GET /scws/: response body missing expected XML');
      failed++;
    } else {
      console.log('PASS GET /scws/');
    }
  } catch (e) {
    console.error('FAIL GET /scws/:', e.message);
    failed++;
  }

  // GET /bankfe/ or similar ??? pick one that returns something predictable without auth
  // /bankfe/resources/account/:id requires auth and returns 401 without token ??? that's a valid check
  try {
    const { status } = await request('GET', '/bankfe/resources/account/00000000-0000-0000-0000-000000000001?auth=invalid');
    if (status !== 401) {
      console.error('FAIL GET /bankfe/.../account (no auth): expected 401, got', status);
      failed++;
    } else {
      console.log('PASS GET /bankfe/.../account (unauthorized returns 401)');
    }
  } catch (e) {
    console.error('FAIL GET /bankfe/.../account:', e.message);
    failed++;
  }

  if (failed > 0) {
    process.exit(1);
  }
  console.log('All smoke tests passed.');
}

main();

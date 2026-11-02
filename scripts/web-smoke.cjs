/* Local-only Stage A smoke check. Install Playwright separately or provide its
 * module path through VOCARA_PLAYWRIGHT_MODULE; no application dependency needed. */
const assert = require('node:assert/strict');
const { chromium } = require(process.env.VOCARA_PLAYWRIGHT_MODULE || 'playwright');

async function main() {
  const base = new URL(process.env.VOCARA_WEB_TEST_URL || 'http://localhost:8092');
  assert.ok(['localhost', '127.0.0.1'].includes(base.hostname), 'Only a local test server is allowed');
  assert.equal(base.protocol, 'http:');
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const context = await browser.newContext();
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      return url.origin === base.origin ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const routes = [
      ['/login', /sign in/i],
      ['/signup', /account/i],
      ['/privacy', /privacy/i],
      ['/terms', /terms/i],
    ];
    for (const [path, expected] of routes) {
      const response = await page.goto(new URL(path, base).href, { waitUntil: 'domcontentloaded', timeout: 180000 });
      assert.ok(response?.ok(), 'Route response failed: ' + path);
      await page.getByText(expected).first().waitFor({ timeout: 60000 });
      assert.equal(new URL(page.url()).pathname, path);
      assert.equal(errors.length, 0, 'Browser runtime error on ' + path);
      console.log('PASS public route ' + path);
    }
    // Exercise client-side navigation rather than only direct HTTP responses.
    await page.goto(new URL('/login', base).href);
    await page.getByText('Create account', { exact: true }).click();
    await page.waitForURL('**/signup');
    assert.equal(errors.length, 0, 'Browser runtime error during navigation');
    console.log('PASS login-to-signup navigation; external requests blocked');
  } finally {
    await browser.close();
  }
}
main().catch(() => { console.error('FAIL browser smoke check; inspect local server and synthetic configuration.'); process.exitCode = 1; });

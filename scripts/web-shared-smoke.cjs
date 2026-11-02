const assert = require('node:assert/strict');
const { Buffer } = require('node:buffer');
const { chromium } = require(process.env.VOCARA_PLAYWRIGHT_MODULE || 'playwright');

async function main() {
  const origin = 'http://localhost:8093';
  const backend = 'https://vocara-stage-a.invalid';
  const user = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'fixture@example.invalid', user_metadata: { full_name: 'Fixture User' }, app_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
  const jwt = [Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'), Buffer.from(JSON.stringify({ sub: user.id, exp: 4102444800 })).toString('base64url'), 'c3ludGhldGlj'].join('.');
  const session = { access_token: jwt, refresh_token: 'synthetic-refresh', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user };
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const context = await browser.newContext();
    const requested = [];
    let onboardingCompleted = true;
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      if (url.origin !== backend) return route.abort();
      requested.push(url.pathname);
      let body = null;
      if (url.pathname === '/auth/v1/user') body = user;
      else if (url.pathname === '/auth/v1/token') body = session;
      else if (url.pathname === '/rest/v1/profiles') body = { id: user.id, full_name: 'Fixture User', target_role: 'Support Specialist', onboarding_completed: onboardingCompleted };
      else if (url.pathname === '/rest/v1/user_focus_areas') body = [];
      else if (url.pathname === '/rest/v1/rpc/get_feature_usage_summary') body = [{ feature: 'ai_feedback', used: 1, limit_value: 5 }];
      else if (url.pathname === '/rest/v1/rpc/get_user_practice_metrics') body = { readinessScore: 72, previousReadinessScore: 68, sessionsCompleted: 1, practiceSeconds: 300, skills: null, practiceCompletedAt: [], recentSessions: [{ id:'22222222-2222-4222-8222-222222222222', role: 'Stage B saved interview', interviewType: 'standard', score: 72, durationSeconds: 300, completedAt:'2026-10-29T10:00:00Z' }] };
      return route.fulfill({ status: 200, contentType: 'application/json', headers: {'access-control-allow-origin':origin,'access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PUT,OPTIONS'}, body: JSON.stringify(body) });
    });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(120000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin + '/login', { timeout: 180000, waitUntil: 'domcontentloaded' });
    await page.getByText('Welcome back', { exact:true }).waitFor({timeout:60000});
    await page.getByPlaceholder('you@example.com').fill(user.email);
    await page.getByPlaceholder('Your password').fill('synthetic-password');
    await page.getByText('Sign In',{exact:true}).click();
    await page.waitForURL('**/home');
    console.log('PASS password sign-in form with intercepted Auth fixture');
    for (const width of [320,390,768,1024,1366,1440]) {
      await page.setViewportSize({ width, height:900 });
      await page.goto(origin+'/home');
      await page.getByText('Stage B saved interview', {exact:true}).waitFor({timeout:30000});
      await page.getByText('4 answer allowances available', {exact:true}).waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1), 'Home overflows at '+width);
      await page.goto(origin+'/interview/setup');
      await page.getByText('Set up your interview', {exact:true}).waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1), 'Setup overflows at '+width);
      console.log('PASS fixture history, session reload, allowance and setup at '+width);
    }
    await page.screenshot({path:'dist/stage-b-setup.png'});
    await page.goto(origin+'/home');
    await page.getByText('Stage B saved interview',{exact:true}).waitFor();
    await page.screenshot({path:'dist/stage-b-home.png'});
    await page.goto(origin+'/auth/callback#access_token='+jwt+'&refresh_token=synthetic-refresh&type=recovery');
    await page.getByText('Link confirmed',{exact:true}).waitFor({timeout:30000});
    assert.equal(new URL(page.url()).hash,'','Consumed credentials remain in history');
    await page.reload();
    await page.getByText('Link confirmed',{exact:true}).waitFor({timeout:30000});
    await page.getByText('Create New Password',{exact:true}).click();
    await page.waitForURL('**/reset-password');
    console.log('PASS recovery fragment, credential removal, callback reload and reset navigation');
    await page.goto(origin+'/profile');
    await page.getByText('Log out',{exact:true}).click();
    await page.waitForURL('**/login');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('sb-vocara-stage-a-auth-token')),null);
    await page.goto(origin+'/home');
    await page.getByText('Welcome back',{exact:true}).waitFor();
    console.log('PASS logout clears browser session and protected home redirects to login');
    onboardingCompleted = false;
    await page.getByPlaceholder('you@example.com').fill(user.email);
    await page.getByPlaceholder('Your password').fill('synthetic-password');
    await page.getByText('Sign In',{exact:true}).click();
    await page.waitForURL('**/career-setup');
    console.log('PASS incomplete profile routes to career setup');
    assert.equal(errors.length,0,errors.join('\n'));
    assert.ok(requested.includes('/rest/v1/rpc/get_user_practice_metrics'));
    console.log('PASS shared server-backed metrics fixture; no live backend requests');
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e.message); process.exitCode=1; });

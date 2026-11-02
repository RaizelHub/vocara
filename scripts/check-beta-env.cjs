const { Buffer } = require('node:buffer');

function checkBetaEnvironment(env) {
  const errors = [];
  const allowed = new Set(['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'EXPO_PUBLIC_REVENUECAT_TEST_API_KEY', 'EXPO_PUBLIC_SENTRY_DSN']);
  for (const name of Object.keys(env)) {
    if (name.startsWith('EXPO_PUBLIC_') && env[name] && !allowed.has(name)) errors.push('Unreviewed public environment variable: ' + name);
  }
  try {
    const url = new URL(env.EXPO_PUBLIC_SUPABASE_URL);
    if (url.protocol !== 'https:' || url.username || url.password || /^(localhost|127\.|10\.|192\.168\.|\[::1\])/.test(url.hostname)) throw new Error();
  } catch { errors.push('Preview requires a reviewed HTTPS Supabase URL.'); }
  const key = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
  let publicKey = key.startsWith('sb_publishable_') && key.length > 20;
  if (!publicKey) {
    try { publicKey = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'anon'; } catch { /* Invalid or private keys fail closed. */ }
  }
  if (!publicKey) errors.push('Supabase key must be publishable or an anon JWT; privileged keys are forbidden.');
  const billing = env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY;
  if (billing && !billing.startsWith('test_')) errors.push('Only a RevenueCat Test Store key is allowed.');
  return errors;
}

module.exports = { checkBetaEnvironment };
if (require.main === module && (process.argv.includes('--check') || process.env.EAS_BUILD_PROFILE === 'preview')) {
  // Read values already supplied by EAS/the caller. Never print their contents.
  const errors = checkBetaEnvironment(process.env);
  for (const error of errors) console.error(error);
  if (errors.length) process.exitCode = 1;
  else console.log('Beta public environment checks passed (deployment is not verified).');
}

const { Buffer } = require('node:buffer');
const fs = require('node:fs');
const path = require('node:path');

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

function checkAndroidPermissions(appConfig, manifestContent) {
  const errors = [];
  const blocked = appConfig?.expo?.android?.blockedPermissions || [];
  const permissions = appConfig?.expo?.android?.permissions || [];

  if (!blocked.includes('android.permission.SYSTEM_ALERT_WINDOW')) {
    errors.push('SYSTEM_ALERT_WINDOW must be excluded via android.blockedPermissions in app.json.');
  }
  if (permissions.includes('android.permission.SYSTEM_ALERT_WINDOW')) {
    errors.push('SYSTEM_ALERT_WINDOW must not be declared in android.permissions in app.json.');
  }
  if (!permissions.includes('android.permission.RECORD_AUDIO')) {
    errors.push('RECORD_AUDIO must be preserved in android.permissions in app.json.');
  }

  if (manifestContent) {
    const alertWindowRegex = /<uses-permission[^>]*android:name=["']android\.permission\.SYSTEM_ALERT_WINDOW["'][^>]*>/i;
    const match = manifestContent.match(alertWindowRegex);
    if (match && !match[0].includes('tools:node="remove"') && !match[0].includes("tools:node='remove'")) {
      errors.push('android/app/src/main/AndroidManifest.xml must not declare SYSTEM_ALERT_WINDOW without tools:node="remove".');
    }
    if (!manifestContent.includes('android.permission.RECORD_AUDIO')) {
      errors.push('android/app/src/main/AndroidManifest.xml must preserve RECORD_AUDIO.');
    }
  }

  return errors;
}

module.exports = { checkBetaEnvironment, checkAndroidPermissions };

if (require.main === module && (process.argv.includes('--check') || process.env.EAS_BUILD_PROFILE === 'preview')) {
  // Read values already supplied by EAS/the caller. Never print their contents.
  const errors = checkBetaEnvironment(process.env);

  try {
    const rootDir = path.resolve(__dirname, '..');
    const appJsonPath = path.join(rootDir, 'app.json');
    if (fs.existsSync(appJsonPath)) {
      const appConfig = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
      const manifestPath = path.join(rootDir, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
      const manifestContent = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, 'utf8') : null;
      errors.push(...checkAndroidPermissions(appConfig, manifestContent));
    }
  } catch (err) {
    errors.push('Failed to inspect Android configuration: ' + (err instanceof Error ? err.message : String(err)));
  }

  for (const error of errors) console.error(error);
  if (errors.length) process.exitCode = 1;
  else console.log('Beta public environment and Android permission checks passed (deployment is not verified).');
}

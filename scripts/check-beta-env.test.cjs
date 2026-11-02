const { Buffer } = require('node:buffer');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkBetaEnvironment } = require('./check-beta-env.cjs');
const valid = { EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic_fixture' };
test('accepts public configuration without optional billing', () => assert.deepEqual(checkBetaEnvironment(valid), []));
test('rejects private and service-role keys', () => {
  for (const key of ['sb_secret_fixture', 'x.' + Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url') + '.x']) assert.ok(checkBetaEnvironment({...valid, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:key}).length);
});
test('rejects missing and local backend URLs', () => {
  for (const url of ['', 'http://example.com', 'https://localhost']) assert.ok(checkBetaEnvironment({...valid, EXPO_PUBLIC_SUPABASE_URL:url}).length);
});
test('rejects unreviewed public secrets and production billing', () => {
  assert.ok(checkBetaEnvironment({...valid, EXPO_PUBLIC_GROQ_API_KEY:'synthetic'}).length);
  assert.ok(checkBetaEnvironment({...valid, EXPO_PUBLIC_REVENUECAT_TEST_API_KEY:'goog_synthetic'}).length);
});
test('accepts anon JWT and test billing', () => assert.deepEqual(checkBetaEnvironment({...valid, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'x.' + Buffer.from(JSON.stringify({role:'anon'})).toString('base64url') + '.x', EXPO_PUBLIC_REVENUECAT_TEST_API_KEY:'test_synthetic'}), []));

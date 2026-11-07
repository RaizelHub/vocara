const { Buffer } = require('node:buffer');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkBetaEnvironment, checkAndroidPermissions } = require('./check-beta-env.cjs');
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

const validAppConfig = {
  expo: {
    android: {
      blockedPermissions: [
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
      ],
      permissions: [
        'android.permission.RECORD_AUDIO',
        'android.permission.MODIFY_AUDIO_SETTINGS',
      ],
    },
  },
};

const validManifest = `
<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools">
  <uses-permission android:name="android.permission.RECORD_AUDIO"/>
  <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS"/>
  <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" tools:node="remove"/>
</manifest>
`;

test('accepts valid Android permissions configuration', () => {
  assert.deepEqual(checkAndroidPermissions(validAppConfig, validManifest), []);
});

test('rejects app.json missing SYSTEM_ALERT_WINDOW in blockedPermissions', () => {
  const invalid = { expo: { android: { blockedPermissions: [], permissions: ['android.permission.RECORD_AUDIO'] } } };
  const errors = checkAndroidPermissions(invalid, validManifest);
  assert.ok(errors.some(e => e.includes('SYSTEM_ALERT_WINDOW must be excluded')));
});

test('rejects app.json declaring SYSTEM_ALERT_WINDOW in permissions', () => {
  const invalid = {
    expo: {
      android: {
        blockedPermissions: ['android.permission.SYSTEM_ALERT_WINDOW'],
        permissions: ['android.permission.RECORD_AUDIO', 'android.permission.SYSTEM_ALERT_WINDOW'],
      },
    },
  };
  const errors = checkAndroidPermissions(invalid, validManifest);
  assert.ok(errors.some(e => e.includes('SYSTEM_ALERT_WINDOW must not be declared')));
});

test('rejects AndroidManifest.xml declaring SYSTEM_ALERT_WINDOW without tools:node="remove"', () => {
  const bareManifest = `
  <manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.RECORD_AUDIO"/>
    <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW"/>
  </manifest>
  `;
  const errors = checkAndroidPermissions(validAppConfig, bareManifest);
  assert.ok(errors.some(e => e.includes('tools:node="remove"')));
});

test('rejects AndroidManifest.xml missing RECORD_AUDIO', () => {
  const noAudioManifest = `
  <manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools">
    <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" tools:node="remove"/>
  </manifest>
  `;
  const errors = checkAndroidPermissions(validAppConfig, noAudioManifest);
  assert.ok(errors.some(e => e.includes('must preserve RECORD_AUDIO')));
});

import { strict as assert } from "node:assert";

import {
  entitlementActive,
  eventGrantsEntitlement,
  eventRevokesEntitlement,
  parseRevenueCatEvent,
  resolveProEntitlement,
  toIso,
  verifyHmac,
  verifyRevenueCatRequest,
  type RevenueCatEvent,
} from "../_shared/subscription.ts";
import {
  FEATURE_KEYS,
  FeatureAccessError,
  enforceFeatureAccess,
  mapFeatureAccessError,
} from "../_shared/featureAccess.ts";

function makeEvent(overrides: Record<string, unknown> = {}): RevenueCatEvent {
  return {
    id: "evt_123",
    type: "INITIAL_PURCHASE",
    app_user_id: "00000000-0000-0000-0000-000000000001",
    original_app_user_id: null,
    product_id: "vocara_pro_monthly",
    store: "PLAY_STORE",
    purchased_at_ms: 1_700_000_000_000,
    expiration_at_ms: 1_760_000_000_000,
    management_url: null,
    entitlement_ids: ["pro"],
    entitlements: null,
    ...overrides,
  } as RevenueCatEvent;
}

Deno.test("grant events flip the subscriber to pro, revoke events end it", () => {
  for (const type of [
    "INITIAL_PURCHASE",
    "RENEWAL",
    "UNCANCELLATION",
    "PRODUCT_CHANGE",
    "SUBSCRIPTION_EXTENDED",
    "UNPAUSED",
    "TRANSFER",
    "NON_RENEWING_PURCHASE",
  ]) {
    assert.equal(eventGrantsEntitlement(type), true, `${type} should grant`);
  }
  for (const type of ["EXPIRATION", "REVOCATION"]) {
    assert.equal(eventRevokesEntitlement(type), true, `${type} should revoke`);
  }
  assert.equal(eventGrantsEntitlement("CANCELLATION"), false);
  assert.equal(eventGrantsEntitlement("BILLING_ISSUE"), false);
  assert.equal(eventRevokesEntitlement("RENEWAL"), false);
  assert.equal(eventRevokesEntitlement("CANCELLATION"), false);
});

Deno.test("parseRevenueCatEvent validates shape and coerces fields", () => {
  const { event } = parseRevenueCatEvent(JSON.stringify({ event: makeEvent() }));
  assert.equal(event.id, "evt_123");
  assert.equal(event.app_user_id, "00000000-0000-0000-0000-000000000001");
  assert.equal(event.product_id, "vocara_pro_monthly");
  assert.deepEqual(event.entitlement_ids, ["pro"]);

  assert.throws(() => parseRevenueCatEvent("not json"), /INVALID_JSON/);
  assert.throws(() => parseRevenueCatEvent(JSON.stringify({})), /INVALID_EVENT/);
  assert.throws(
    () => parseRevenueCatEvent(JSON.stringify({ event: { id: 42 } })),
    /INVALID_EVENT/,
  );
  assert.throws(
    () =>
      parseRevenueCatEvent(
        JSON.stringify({ event: { id: "x", type: "RENEWAL", app_user_id: "" } }),
      ),
    /INVALID_EVENT/,
  );
});

Deno.test("resolveProEntitlement handles modern and legacy payloads", () => {
  const modern = makeEvent({
    entitlement_ids: null,
    expiration_at_ms: null,
    entitlements: {
      pro: { source: "PLAY_STORE", expires_date: "2026-01-01T00:00:00.000Z" },
    },
  });
  const resolved = resolveProEntitlement(parseRevenueCatEvent(JSON.stringify({ event: modern })).event);
  assert.equal(resolved.entitlementId, "pro");
  assert.equal(resolved.expiresAtMs, Date.parse("2026-01-01T00:00:00.000Z"));
  assert.equal(resolved.source, "PLAY_STORE");

  const legacy = makeEvent({ entitlements: null });
  const legacyResolved = resolveProEntitlement(parseRevenueCatEvent(JSON.stringify({ event: legacy })).event);
  assert.equal(legacyResolved.entitlementId, "pro");
  assert.equal(legacyResolved.expiresAtMs, 1_760_000_000_000);

  const noPro = makeEvent({ entitlements: null, entitlement_ids: ["meditation"] });
  assert.deepEqual(
    resolveProEntitlement(parseRevenueCatEvent(JSON.stringify({ event: noPro })).event),
    {
      entitlementId: null,
      expiresAtMs: null,
      source: null,
      managementUrl: null,
    },
  );
});

Deno.test("entitlementActive treats null expiry as active and past expiry as lapsed", () => {
  const now = Date.now();
  assert.equal(entitlementActive(null, now), true);
  assert.equal(entitlementActive(now + 60_000, now), true);
  assert.equal(entitlementActive(now - 1, now), false);
});

Deno.test("toIso round-trips timestamps and rejects nulls", () => {
  assert.equal(toIso(0), new Date(0).toISOString());
  assert.equal(toIso(null), null);
  assert.equal(toIso(Number.NaN), null);
});

Deno.test("HMAC verification accepts the canonical signature and rejects tampering", async () => {
  const secret = "s3cret-webhook";
  const body = JSON.stringify({ event: makeEvent() });
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  assert.equal(await verifyHmac(secret, body, hex.toUpperCase()), true);
  assert.equal(await verifyHmac(secret, body, hex.slice(0, -2) + "ff"), false);
});

Deno.test("verifyRevenueCatRequest fails closed and supports both auth schemes", async () => {
  const secret = "s3cret-webhook";
  const body = JSON.stringify({ event: makeEvent() });
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  assert.equal(await verifyRevenueCatRequest(secret, null, hex, body), true);
  assert.equal(
    await verifyRevenueCatRequest(secret, "Bearer s3cret-webhook", null, body),
    true,
  );
  assert.equal(await verifyRevenueCatRequest(undefined, "Bearer x", null, body), false);
  assert.equal(await verifyRevenueCatRequest(secret, null, null, body), false);
  assert.equal(await verifyRevenueCatRequest(secret, "Bearer wrong", null, body), false);
  assert.equal(await verifyRevenueCatRequest(secret, null, hex.slice(0, -1) + "0", body), false);
});

Deno.test("enforceFeatureAccess returns result and maps RPC failures to FeatureAccessError", async () => {
  const allowedClient = {
    rpc: async () => ({
      data: { allowed: true, plan: "pro", alreadyCounted: false },
      error: null,
    }),
  };
  const result = await enforceFeatureAccess(
    allowedClient as never,
    "user-1",
    FEATURE_KEYS.aiFeedback,
    "attempt-1",
  );
  assert.equal(result.allowed, true);
  assert.equal(result.plan, "pro");

  const deniedClient = {
    rpc: async () => ({ data: null, error: null }),
  };
  await assert.rejects(
    () =>
      enforceFeatureAccess(deniedClient as never, "user-1", FEATURE_KEYS.aiFeedback, "attempt-1"),
    (error: unknown) => {
      assert.ok(error instanceof FeatureAccessError);
      assert.equal(error.status, 500);
      assert.equal(error.code, "feature_access_failed");
      assert.equal(error.retryable, true);
      return true;
    },
  );

  const blockedClient = {
    rpc: async () => ({
      data: null,
      error: { message: 'plpgsql exception "VOCARA_PRO_REQUIRED" in check_feature_access' },
    }),
  };
  await assert.rejects(
    () =>
      enforceFeatureAccess(blockedClient as never, "user-1", FEATURE_KEYS.deepInterview, "attempt-1"),
    (error: unknown) => {
      assert.ok(error instanceof FeatureAccessError);
      assert.equal(error.status, 402);
      assert.equal(error.code, "pro_required");
      return true;
    },
  );
});

Deno.test("mapFeatureAccessError maps limit, pro-required, and unknown messages", () => {
  const limit = mapFeatureAccessError({ message: 'exception "VOCARA_FEATURE_LIMIT_REACHED"' });
  assert.equal(limit.status, 429);
  assert.equal(limit.code, "feature_limit_reached");
  assert.equal(limit.retryable, true);

  const pro = mapFeatureAccessError({ message: 'exception "VOCARA_PRO_REQUIRED"' });
  assert.equal(pro.status, 402);
  assert.equal(pro.code, "pro_required");

  const unknown = mapFeatureAccessError({ message: "connection reset" });
  assert.equal(unknown.status, 500);
  assert.equal(unknown.code, "feature_access_failed");
});

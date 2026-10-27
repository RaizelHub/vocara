// RevenueCat webhook + entitlement helpers shared by the
// revenuecat-webhook and sync-subscription edge functions.

export type RevenueCatPlan = "free" | "pro";

export const PRO_ENTITLEMENT_ID = "pro";

// Events that (re)confirm an entitlement and should flip a subscriber to Pro.
const ENTITLEMENT_GRANT_EVENTS = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "PRODUCT_CHANGE",
  "SUBSCRIPTION_EXTENDED",
  "UNPAUSED",
  "TRANSFER",
  "NON_RENEWING_PURCHASE",
]);

// Events that end the entitlement immediately.
const ENTITLEMENT_REVOKE_EVENTS = new Set(["EXPIRATION", "REVOCATION"]);

export function eventGrantsEntitlement(eventType: string) {
  return ENTITLEMENT_GRANT_EVENTS.has(eventType);
}

export function eventRevokesEntitlement(eventType: string) {
  return ENTITLEMENT_REVOKE_EVENTS.has(eventType);
}

export type RevenueCatEvent = {
  id: string;
  type: string;
  app_user_id: string;
  original_app_user_id: string | null;
  product_id: string | null;
  store: string | null;
  purchased_at_ms: number | null;
  expiration_at_ms: number | null;
  management_url: string | null;
  entitlement_ids: string[] | null;
  entitlements: Record<string, unknown> | null;
};

export function parseRevenueCatEvent(
  body: string,
): { event: RevenueCatEvent } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error("INVALID_JSON");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("INVALID_PAYLOAD");
  const event = (parsed as { event?: unknown }).event;
  if (!event || typeof event !== "object") throw new Error("INVALID_EVENT");
  const record = event as Record<string, unknown>;

  const id = record.id;
  const type = record.type;
  const appUserId = record.app_user_id;
  if (
    typeof id !== "string" || !id ||
    typeof type !== "string" || !type ||
    typeof appUserId !== "string" || !appUserId
  ) {
    throw new Error("INVALID_EVENT");
  }

  return {
    event: {
      id,
      type,
      app_user_id: appUserId,
      original_app_user_id:
        typeof record.original_app_user_id === "string"
          ? record.original_app_user_id
          : null,
      product_id: typeof record.product_id === "string" ? record.product_id : null,
      store: typeof record.store === "string" ? record.store : null,
      purchased_at_ms:
        typeof record.purchased_at_ms === "number" ? record.purchased_at_ms : null,
      expiration_at_ms:
        typeof record.expiration_at_ms === "number" ? record.expiration_at_ms : null,
      management_url:
        typeof record.management_url === "string" ? record.management_url : null,
      entitlement_ids: Array.isArray(record.entitlement_ids)
        ? record.entitlement_ids.filter((entry): entry is string =>
            typeof entry === "string"
          )
        : null,
      entitlements:
        record.entitlements && typeof record.entitlements === "object" &&
          !Array.isArray(record.entitlements)
          ? record.entitlements as Record<string, unknown>
          : null,
    },
  };
}

export type ParsedEntitlement = {
  entitlementId: string | null;
  expiresAtMs: number | null;
  source: string | null;
  managementUrl: string | null;
};

// Resolves the "pro" entitlement from either the modern `entitlements` object
// or the legacy `entitlement_ids` array, and returns its expiry + source.
export function resolveProEntitlement(event: RevenueCatEvent): ParsedEntitlement {
  let expiresAtMs: number | null = null;
  let source: string | null = null;
  let found = false;

  if (event.entitlements) {
    const entry = event.entitlements[PRO_ENTITLEMENT_ID];
    if (entry && typeof entry === "object") {
      const record = entry as Record<string, unknown>;
      found = true;
      source = typeof record.source === "string" ? record.source : null;
      if (typeof record.expires_date === "string") {
        const parsed = Date.parse(record.expires_date);
        if (!Number.isNaN(parsed)) expiresAtMs = parsed;
      } else if (typeof record.expires_date_ms === "number") {
        expiresAtMs = record.expires_date_ms;
      } else if (typeof record.expiresDate === "string") {
        const parsed = Date.parse(record.expiresDate);
        if (!Number.isNaN(parsed)) expiresAtMs = parsed;
      }
    }
  } else if (event.entitlement_ids) {
    found = event.entitlement_ids.includes(PRO_ENTITLEMENT_ID);
  }

  if (!found) return { entitlementId: null, expiresAtMs: null, source: null, managementUrl: null };

  return {
    entitlementId: PRO_ENTITLEMENT_ID,
    expiresAtMs: event.expiration_at_ms ?? expiresAtMs,
    source,
    managementUrl: event.management_url,
  };
}

export function entitlementActive(expiresAtMs: number | null, nowMs = Date.now()) {
  return expiresAtMs === null || expiresAtMs > nowMs;
}

// Webhook verification. Fails closed: if REVENUECAT_WEBHOOK_SECRET is unset,
// the request is rejected. Supports both the legacy `Authorization: Bearer`
// scheme and the modern `X-RevenueCat-Signature` HMAC header.
export async function verifyRevenueCatRequest(
  secret: string | undefined,
  authorization: string | null,
  signature: string | null,
  rawBody: string,
): Promise<boolean> {
  if (!secret) return false;

  if (signature) {
    return verifyHmac(secret, rawBody, signature);
  }
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return timingSafeEqual(authorization.slice(7).trim(), secret);
  }
  return false;
}

export async function verifyHmac(
  secret: string,
  rawBody: string,
  signature: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return timingSafeEqual(hex, signature.toLowerCase());
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

export type SubscriptionSyncInput = {
  userId: string;
  plan: RevenueCatPlan;
  rcAppUserId: string | null;
  rcOriginalAppUserId: string | null;
  rcEntitlementId: string | null;
  rcEntitlementSource: string | null;
  rcEntitlementCreatedAt: string | null;
  rcEntitlementExpiresAt: string | null;
  rcManagementUrl: string | null;
  rcLastEvent: string | null;
};

export function toIso(milliseconds: number | null) {
  if (milliseconds === null || Number.isNaN(milliseconds)) return null;
  return new Date(milliseconds).toISOString();
}

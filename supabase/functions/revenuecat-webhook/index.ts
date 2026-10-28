import { accountAccessResponse } from "../_shared/accountPrivacy.ts";
import type { SupabaseContext } from "npm:@supabase/server@1.4.1";
import { withSupabase } from "npm:@supabase/server@1.4.1";

import type { Database, UserSubscriptionRow } from "../_shared/database.types.ts";
import {
  entitlementActive,
  eventGrantsEntitlement,
  eventRevokesEntitlement,
  parseRevenueCatEvent,
  resolveProEntitlement,
  toIso,
  verifyRevenueCatRequest,
  type RevenueCatEvent,
} from "../_shared/subscription.ts";

export default {
  fetch: withSupabase<Database>(
    {},
    async (request: Request, context: SupabaseContext<Database>) => {
      if (request.method !== "POST") {
        return Response.json({ error: "method_not_allowed" }, { status: 405 });
      }

      const secret = Deno.env.get("REVENUECAT_WEBHOOK_SECRET");
      const rawBody = await request.text();
      const signature = request.headers.get("X-RevenueCat-Signature");
      const authorization = request.headers.get("Authorization");

      const verified = await verifyRevenueCatRequest(
        secret,
        authorization,
        signature,
        rawBody,
      );
      if (!verified) {
        console.error("[revenuecat-webhook] Signature verification failed");
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }

      let event: RevenueCatEvent;
      try {
        ({ event } = parseRevenueCatEvent(rawBody));
      } catch (error) {
        console.error("[revenuecat-webhook] Invalid payload");
        return Response.json({ error: "invalid_payload" }, { status: 400 });
      }

      // Idempotency: duplicate event ids are acknowledged, never reprocessed.
      const { error: markError } = await context.supabaseAdmin
        .from("revenuecat_webhook_events")
        .insert({ event_id: event.id });
      if (markError) {
        if (markError.message.includes("duplicate key")) {
          return Response.json({ received: true, duplicate: true });
        }
        console.error("[revenuecat-webhook] Failed to mark event");
        return Response.json({ error: "storage_failed" }, { status: 500 });
      }

      try {
        await applyEvent(context, event);
        const { error: doneError } = await context.supabaseAdmin
          .from("revenuecat_webhook_events")
          .update({ processed_at: new Date().toISOString() })
          .eq("event_id", event.id);
        if (doneError) {
          console.error("[revenuecat-webhook] Failed to finalize event");
        }
        return Response.json({ received: true });
      } catch (error) {
        console.error("[revenuecat-webhook] Event processing failed");
        return Response.json({ error: "processing_failed" }, { status: 500 });
      }
    },
  ),
};

async function applyEvent(
  context: SupabaseContext<Database>,
  event: RevenueCatEvent,
) {
  const userId = event.app_user_id;
  const denied = await accountAccessResponse(context.supabaseAdmin, userId);
  if (denied?.status === 503) throw new Error("ACCOUNT_CHECK_UNAVAILABLE");
  if (denied) return; // Never recreate entitlements for deleted/pending accounts.

  const { data: existing } = await context.supabaseAdmin
    .from("user_subscriptions")
    .select("plan")
    .eq("user_id", userId)
    .maybeSingle();

  const entitlement = resolveProEntitlement(event);
  const active = entitlementActive(entitlement.expiresAtMs);

  let plan: "free" | "pro";
  if (eventGrantsEntitlement(event.type)) {
    plan = entitlement.entitlementId === "pro" && active ? "pro" : "free";
  } else if (eventRevokesEntitlement(event.type)) {
    plan = "free";
  } else {
    // CANCELLATION / BILLING_ISSUE / PAUSED etc: keep the current state;
    // the entitlement remains valid until its expiry.
    plan = (existing as UserSubscriptionRow | null)?.plan === "pro"
      ? "pro"
      : "free";
  }

  const { error: syncError } = await context.supabaseAdmin.rpc(
    "sync_user_subscription",
    {
      p_user_id: userId,
      p_plan: plan,
      p_rc_app_user_id: event.app_user_id,
      p_rc_original_app_user_id: event.original_app_user_id,
      p_rc_entitlement_id: entitlement.entitlementId,
      p_rc_entitlement_source: entitlement.source,
      p_rc_entitlement_created_at: toIso(event.purchased_at_ms),
      p_rc_entitlement_expires_at: toIso(entitlement.expiresAtMs),
      p_rc_management_url: entitlement.managementUrl,
      p_rc_last_event: event.type,
    },
  );
  if (syncError) {
    throw new Error(`SUBSCRIPTION_SYNC_FAILED: ${syncError.message}`);
  }
}

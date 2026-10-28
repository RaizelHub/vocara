import { accountAccessResponse } from "../_shared/accountPrivacy.ts";
import type { SupabaseContext } from "npm:@supabase/server@1.4.1";
import { withSupabase } from "npm:@supabase/server@1.4.1";

import type { Database } from "../_shared/database.types.ts";
import {
  entitlementActive,
  PRO_ENTITLEMENT_ID,
  toIso,
} from "../_shared/subscription.ts";

const REVENUECAT_API_URL = "https://api.revenuecat.com/v1/subscribers";

export default {
  fetch: withSupabase<Database>(
    { auth: "user" },
    async (request: Request, context: SupabaseContext<Database>) => {
      if (request.method !== "POST") {
        return Response.json(
          { code: "method_not_allowed", message: "Use POST." },
          { status: 405 },
        );
      }

      const userId = context.userClaims?.id;
      if (!userId) {
        return Response.json(
          { code: "unauthorized", message: "Authentication is required." },
          { status: 401 },
        );
      }
      const accountDenied = await accountAccessResponse(context.supabaseAdmin, userId);
      if (accountDenied) return accountDenied;


      const secretApiKey = Deno.env.get("REVENUECAT_SECRET_API_KEY");
      if (!secretApiKey) {
        console.error("[sync-subscription] REVENUECAT_SECRET_API_KEY is not set");
        return Response.json(
          { code: "not_configured", message: "Subscription sync is not configured." },
          { status: 503 },
        );
      }

      try {
        const response = await fetch(
          `${REVENUECAT_API_URL}/${encodeURIComponent(userId)}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${secretApiKey}`,
              "Content-Type": "application/json",
              "X-Platform": "react-native",
            },
            signal: AbortSignal.timeout(15_000),
          },
        );

        if (!response.ok) {
          console.error("[sync-subscription] RevenueCat API error", {
            status: response.status,
          });
          if (response.status === 404) {
            // No subscriber in RevenueCat: the user never purchased anything.
            const { error: syncError } = await context.supabaseAdmin.rpc(
              "sync_user_subscription",
              {
                p_user_id: userId,
                p_plan: "free",
                p_rc_app_user_id: userId,
                p_rc_last_event: "NO_SUBSCRIBER",
              },
            );
            if (syncError) throw syncError;
            return Response.json({ plan: "free" });
          }
          return Response.json(
            { code: "rc_unavailable", message: "We couldn't reach the billing service." },
            { status: 502 },
          );
        }

        const payload = (await response.json()) as Record<string, unknown>;
        const subscriber = payload.subscriber as Record<string, unknown> | null;
        const entitlements = subscriber?.entitlements as Record<string, unknown> | null;
        const pro = entitlements?.[PRO_ENTITLEMENT_ID] as Record<string, unknown> | null;

        const expiresDate = typeof pro?.expires_date === "string"
          ? Date.parse(pro.expires_date)
          : null;
        const active = entitlementActive(
          Number.isNaN(expiresDate) ? null : expiresDate,
        );
        const plan = pro && active ? "pro" : "free";

        const purchasedAt = typeof pro?.purchase_date === "string"
          ? Date.parse(pro.purchase_date)
          : null;

        const { error: syncError } = await context.supabaseAdmin.rpc(
          "sync_user_subscription",
          {
            p_user_id: userId,
            p_plan: plan,
            p_rc_app_user_id: userId,
            p_rc_original_app_user_id:
              typeof subscriber?.original_app_user_id === "string"
                ? subscriber.original_app_user_id
                : null,
            p_rc_entitlement_id: pro ? PRO_ENTITLEMENT_ID : null,
            p_rc_entitlement_source:
              typeof pro?.store === "string" ? pro.store : null,
            p_rc_entitlement_created_at: toIso(
              Number.isNaN(purchasedAt) ? null : purchasedAt,
            ),
            p_rc_entitlement_expires_at: toIso(
              Number.isNaN(expiresDate) ? null : expiresDate,
            ),
            p_rc_management_url:
              typeof subscriber?.management_url === "string"
                ? subscriber.management_url
                : null,
            p_rc_last_event: "SYNCED",
          },
        );
        if (syncError) throw syncError;

        return Response.json({
          plan,
          entitlement: pro
            ? {
                id: PRO_ENTITLEMENT_ID,
                productIdentifier:
                  typeof pro.product_identifier === "string"
                    ? pro.product_identifier
                    : null,
                expiresDate: toIso(Number.isNaN(expiresDate) ? null : expiresDate),
                store: typeof pro.store === "string" ? pro.store : null,
              }
            : null,
        });
      } catch (error) {
        console.error("[sync-subscription] Sync failed", error);
        return Response.json(
          { code: "sync_failed", message: "We couldn't sync your subscription." },
          { status: 502 },
        );
      }
    },
  ),
};

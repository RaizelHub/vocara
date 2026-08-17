import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, Platform } from "react-native";
import type {
  CustomerInfo,
  PurchasesOffering,
  PurchasesOfferings,
  PurchasesPackage,
} from "react-native-purchases";

import {
  addCustomerInfoListener,
  getActiveProPackage,
  getCustomerInfo,
  getOfferings,
  hasProEntitlement,
  loginRevenueCat,
  logoutRevenueCat,
  normalizeRevenueCatError,
  openManageSubscription,
  presentPaywallIfNeeded,
  purchasePackage,
  REVENUECAT_ENTITLEMENTS,
  restorePurchases as rcRestorePurchases,
  type PaywallPresentResult,
} from "@/services/revenueCatService";
import {
  fetchUserSubscription,
  syncSubscriptionToServer,
} from "@/services/subscriptionService";
import { fetchUsageSummary } from "@/services/usageService";
import type { FeatureUsageSummary, UserSubscription } from "@/types/database";
import { useAuth } from "@/providers/AuthProvider";

export type PlanKey = "free" | "pro";

export type PurchaseResult =
  | { status: "purchased" }
  | { status: "pending" }
  | { status: "cancelled" }
  | { status: "restored" }
  | { status: "error"; message: string };

type SubscriptionContextValue = {
  status: "loading" | "ready" | "error";
  plan: PlanKey;
  isPro: boolean;
  subscription: UserSubscription | null;
  usage: FeatureUsageSummary[];
  offerings: PurchasesOfferings | null;
  offering: PurchasesOffering | null;
  monthlyPackage: PurchasesPackage | null;
  annualPackage: PurchasesPackage | null;
  customerInfo: CustomerInfo | null;
  isLoading: boolean;
  isPurchasing: boolean;
  isRestoring: boolean;
  purchasing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  purchaseMonthly: () => Promise<PurchaseResult>;
  purchaseAnnual: () => Promise<PurchaseResult>;
  restorePurchases: () => Promise<PurchaseResult>;
  purchase: (pkg: PurchasesPackage) => Promise<PurchaseResult>;
  restore: () => Promise<PurchaseResult>;
  manage: () => Promise<void>;
  showPaywall: () => Promise<PaywallPresentResult>;
};

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [isLoading, setIsLoading] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null);
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [usage, setUsage] = useState<FeatureUsageSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const userIdRef = useRef<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const proPackages = getActiveProPackage(offerings);
  const offering = proPackages?.offering ?? null;
  const monthlyPackage = proPackages?.monthly ?? null;
  const annualPackage = proPackages?.annual ?? null;

  const isPro = hasProEntitlement(customerInfo);
  const plan: PlanKey = isPro ? "pro" : (subscription?.plan ?? "free");

  const refresh = useCallback(async () => {
    const currentUserId = userIdRef.current;
    if (!currentUserId) return;
    try {
      const [infoRes, subRes, usageRes, offeringsRes] =
        await Promise.allSettled([
          getCustomerInfo(),
          fetchUserSubscription(),
          fetchUsageSummary(),
          getOfferings(),
        ]);
      if (!mounted.current || userIdRef.current !== currentUserId) return;

      if (infoRes.status === "fulfilled") setCustomerInfo(infoRes.value);
      if (subRes.status === "fulfilled") setSubscription(subRes.value);
      if (usageRes.status === "fulfilled") setUsage(usageRes.value ?? []);
      if (offeringsRes.status === "fulfilled") setOfferings(offeringsRes.value);

      setError(null);
      setStatus("ready");
      setIsLoading(false);
    } catch (refreshError) {
      if (!mounted.current || userIdRef.current !== currentUserId) return;
      if (__DEV__) console.error("[VOCARA subscription refresh]", refreshError);
      setError("We couldn't refresh your subscription.");
      setStatus("ready");
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const userId = user?.id ?? null;
    userIdRef.current = userId;
    let cancelled = false;

    void Promise.resolve().then(async () => {
      if (cancelled) return;
      setIsLoading(true);
      setStatus("loading");
      setError(null);

      if (!userId) {
        try {
          await logoutRevenueCat();
        } catch {
          // Ignore logout error
        }
        if (cancelled) return;
        setCustomerInfo(null);
        setSubscription(null);
        setOfferings(null);
        setUsage([]);
        setError(null);
        setStatus("ready");
        setIsLoading(false);
        return;
      }

      try {
        await loginRevenueCat(userId).catch(() => null);

        const [infoRes, subRes, usageRes, offeringsRes] =
          await Promise.allSettled([
            getCustomerInfo(),
            fetchUserSubscription(),
            fetchUsageSummary(),
            getOfferings(),
          ]);
        if (cancelled) return;

        if (infoRes.status === "fulfilled") setCustomerInfo(infoRes.value);
        if (subRes.status === "fulfilled") setSubscription(subRes.value);
        if (usageRes.status === "fulfilled") setUsage(usageRes.value ?? []);
        if (offeringsRes.status === "fulfilled") setOfferings(offeringsRes.value);

        setStatus("ready");
        setIsLoading(false);
      } catch (syncError) {
        if (cancelled) return;
        if (__DEV__) console.error("[VOCARA subscription bootstrap]", syncError);
        setError(null);
        setStatus("ready");
        setIsLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    return addCustomerInfoListener((info) => {
      if (!mounted.current) return;
      setCustomerInfo(info);
      if (info && userIdRef.current && hasProEntitlement(info)) {
        void syncSubscriptionToServer()
          .then(() => refresh())
          .catch(() => {});
      }
    });
  }, [refresh]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const subscriptionListener = AppState.addEventListener("change", (state) => {
      if (state === "active" && userIdRef.current) {
        void refresh();
      }
    });
    return () => subscriptionListener.remove();
  }, [refresh]);

  const purchase = useCallback(
    async (pkg: PurchasesPackage): Promise<PurchaseResult> => {
      if (isPurchasing) return { status: "cancelled" };
      setIsPurchasing(true);
      setError(null);
      try {
        const info = await purchasePackage(pkg);
        setCustomerInfo(info);
        await syncSubscriptionToServer().catch(() => {});
        await refresh();
        const proActive = hasProEntitlement(info);
        return { status: proActive ? "purchased" : "pending" };
      } catch (purchaseError) {
        const norm = normalizeRevenueCatError(purchaseError);
        if (norm.isCancellation) {
          return { status: "cancelled" };
        }
        if (__DEV__ && !norm.userMessage.includes("Expo Go")) {
          console.warn("[VOCARA purchase]", purchaseError);
        }
        setError(norm.userMessage);
        return {
          status: "error",
          message: norm.userMessage,
        };
      } finally {
        setIsPurchasing(false);
      }
    },
    [isPurchasing, refresh],
  );

  const purchaseMonthly = useCallback(async (): Promise<PurchaseResult> => {
    if (!monthlyPackage) {
      return {
        status: "error",
        message: "Monthly package is not available right now.",
      };
    }
    return purchase(monthlyPackage);
  }, [monthlyPackage, purchase]);

  const purchaseAnnual = useCallback(async (): Promise<PurchaseResult> => {
    if (!annualPackage) {
      return {
        status: "error",
        message: "Annual package is not available right now.",
      };
    }
    return purchase(annualPackage);
  }, [annualPackage, purchase]);

  const restorePurchases = useCallback(async (): Promise<PurchaseResult> => {
    if (isRestoring || isPurchasing) return { status: "cancelled" };
    setIsRestoring(true);
    setError(null);
    try {
      const info = await rcRestorePurchases();
      setCustomerInfo(info);
      await syncSubscriptionToServer().catch(() => {});
      await refresh();
      const proActive = hasProEntitlement(info);
      return { status: proActive ? "restored" : "cancelled" };
    } catch (restoreError) {
      const norm = normalizeRevenueCatError(restoreError);
      if (__DEV__ && !norm.userMessage.includes("Expo Go")) {
        console.warn("[VOCARA restore]", restoreError);
      }
      setError(norm.userMessage);
      return {
        status: "error",
        message: norm.userMessage,
      };
    } finally {
      setIsRestoring(false);
    }
  }, [isRestoring, isPurchasing, refresh]);

  const manage = useCallback(async () => {
    try {
      await openManageSubscription(customerInfo);
    } catch (manageError) {
      if (__DEV__) console.error("[VOCARA manage subscription]", manageError);
      setError("We couldn't open subscription management.");
    }
  }, [customerInfo]);

  /**
   * Single entry point for opening the published RevenueCat dashboard paywall.
   * Skips presentation when already Pro, refreshes CustomerInfo afterwards, and
   * lets the CustomerInfo listener keep premium state in sync. Cancellation is
   * not treated as an error.
   */
  const showPaywall = useCallback(async (): Promise<PaywallPresentResult> => {
    const result = await presentPaywallIfNeeded(REVENUECAT_ENTITLEMENTS.PRO);
    if (
      result.status === "purchased" ||
      result.status === "restored" ||
      result.status === "error"
    ) {
      await refresh().catch(() => {});
    }
    return result;
  }, [refresh]);

  return (
    <SubscriptionContext.Provider
      value={{
        status,
        plan,
        isPro,
        subscription,
        usage,
        offerings,
        offering,
        monthlyPackage,
        annualPackage,
        customerInfo,
        isLoading,
        isPurchasing,
        isRestoring,
        purchasing: isPurchasing,
        error,
        refresh,
        purchaseMonthly,
        purchaseAnnual,
        restorePurchases,
        purchase,
        restore: restorePurchases,
        manage,
        showPaywall,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error("useSubscription must be used inside SubscriptionProvider.");
  }
  return context;
}


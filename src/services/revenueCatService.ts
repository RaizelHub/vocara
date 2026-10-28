import { NativeModules, Platform } from "react-native";
import Purchases, {
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesOfferings,
  type PurchasesPackage,
} from "react-native-purchases";
import RevenueCatUI, { PAYWALL_RESULT } from "react-native-purchases-ui";

const testApiKey = process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY?.trim();

export function getRevenueCatApiKey(): string {
  return testApiKey?.startsWith("test_") ? testApiKey : "";
}

export const isNativePurchasesAvailable = Boolean(
  NativeModules?.RNPurchases || (Platform.OS === "web" && false),
);

export const revenueCatEnvironment = {
  get configured(): boolean {
    return isNativePurchasesAvailable && Boolean(getRevenueCatApiKey());
  },
  get key(): string {
    return getRevenueCatApiKey();
  },
  get isNativeAvailable(): boolean {
    return isNativePurchasesAvailable;
  },
} as const;

/**
 * Canonical RevenueCat identifiers. Do not scatter the raw "pro" string across
 * the codebase; reference these constants instead.
 */
export const REVENUECAT_ENTITLEMENTS = {
  PRO: "pro",
} as const;

export const ENTITLEMENT_ID = REVENUECAT_ENTITLEMENTS.PRO;

let initialized = false;

/**
 * Configures the RevenueCat SDK with the specified API key and optional Supabase user UUID.
 * Prevents redundant configure calls while supporting account login/switch.
 * Safely guards against missing native modules (e.g. Expo Go).
 */
export async function configureRevenueCat(appUserId?: string): Promise<boolean> {
  if (!isNativePurchasesAvailable) {
    if (__DEV__) {
      console.warn("[VOCARA RevenueCat] Native module RNPurchases is not available in Expo Go. Use an Expo Development Build for real transactions.");
    }
    return false;
  }

  const apiKey = getRevenueCatApiKey();
  if (!apiKey) {
    if (__DEV__) {
      console.warn("[VOCARA RevenueCat] EXPO_PUBLIC_REVENUECAT_TEST_API_KEY is not set in .env");
    }
    return false;
  }

  if (initialized) {
    if (appUserId) {
      try {
        await Purchases.logIn(appUserId);
      } catch {
        if (__DEV__) console.error("[VOCARA RevenueCat login]");
      }
    }
    return true;
  }

  try {
    Purchases.setLogLevel(LOG_LEVEL.ERROR);
    Purchases.setLogHandler(() => {}); // SDK messages may include customer/receipt details.
    if (appUserId) {
      Purchases.configure({ apiKey, appUserID: appUserId });
    } else {
      Purchases.configure({ apiKey });
    }
    initialized = true;
    return true;
  } catch {
    if (__DEV__) console.error("[VOCARA RevenueCat configure]");
    return false;
  }
}

export async function loginRevenueCat(appUserId: string): Promise<CustomerInfo | null> {
  if (!isNativePurchasesAvailable) return null;
  const apiKey = getRevenueCatApiKey();
  if (!apiKey) return null;

  if (!initialized) {
    const success = await configureRevenueCat(appUserId);
    if (!success) return null;
    return getCustomerInfo();
  }

  try {
    const result = await Purchases.logIn(appUserId);
    return result.customerInfo;
  } catch {
    if (__DEV__) console.error("[VOCARA RevenueCat logIn]");
    return getCustomerInfo();
  }
}

export async function logoutRevenueCat(): Promise<CustomerInfo | null> {
  if (!initialized || !isNativePurchasesAvailable) return null;
  try {
    const result = await Purchases.logOut();
    return result;
  } catch {
    if (__DEV__) console.error("[VOCARA RevenueCat logOut]");
    return null;
  }
}

export async function getOfferings(): Promise<PurchasesOfferings | null> {
  if (!initialized || !isNativePurchasesAvailable) return null;
  try {
    return await Purchases.getOfferings();
  } catch {
    if (__DEV__) console.error("[VOCARA RevenueCat getOfferings]");
    return null;
  }
}

export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (!initialized || !isNativePurchasesAvailable) return null;
  try {
    return await Purchases.getCustomerInfo();
  } catch {
    if (__DEV__) console.error("[VOCARA RevenueCat getCustomerInfo]");
    return null;
  }
}

export async function purchasePackage(
  pkg: PurchasesPackage,
): Promise<CustomerInfo> {
  if (!initialized || !isNativePurchasesAvailable) {
    throw new Error("purchases_unavailable");
  }
  const result = await Purchases.purchasePackage(pkg);
  return result.customerInfo;
}

export async function restorePurchases(): Promise<CustomerInfo> {
  if (!initialized || !isNativePurchasesAvailable) {
    throw new Error("purchases_unavailable");
  }
  return Purchases.restorePurchases();
}

/**
 * Entitlement checker function strictly verifying active "pro" entitlement.
 */
export function hasProEntitlement(customerInfo: CustomerInfo | null): boolean {
  if (!customerInfo) return false;
  const entitlement = customerInfo.entitlements.active[ENTITLEMENT_ID];
  return entitlement !== undefined && entitlement !== null;
}

export function isProActive(customerInfo: CustomerInfo | null): boolean {
  return hasProEntitlement(customerInfo);
}

export function getProExpirationMs(customerInfo: CustomerInfo | null): number | null {
  const entitlement = customerInfo?.entitlements.active[ENTITLEMENT_ID];
  if (!entitlement) return null;
  return entitlement.expirationDate === null ||
    entitlement.expirationDate === undefined
    ? null
    : new Date(entitlement.expirationDate).getTime();
}

export function getManagementUrl(customerInfo: CustomerInfo | null): string | null {
  return customerInfo?.managementURL ?? null;
}

export async function openManageSubscription(
  customerInfo: CustomerInfo | null,
): Promise<void> {
  if (Platform.OS === "ios" && initialized && isNativePurchasesAvailable) {
    try {
      await Purchases.showManageSubscriptions();
      return;
    } catch {
      // Fall through to the web URL.
    }
  }
  const url = getManagementUrl(customerInfo);
  if (url) {
    await openExternalUrl(url);
  }
}

async function openExternalUrl(url: string): Promise<void> {
  const { Linking } = await import("react-native");
  const supported = await Linking.canOpenURL(url);
  if (supported) {
    await Linking.openURL(url);
  }
}

const customerInfoListeners = new Set<(customerInfo: CustomerInfo) => void>();

/**
 * Registers a customer-info change listener.
 */
export function addCustomerInfoListener(
  listener: (customerInfo: CustomerInfo) => void,
): () => void {
  customerInfoListeners.add(listener);
  if (initialized && isNativePurchasesAvailable) {
    try {
      Purchases.addCustomerInfoUpdateListener((info) => {
        for (const registered of customerInfoListeners) registered(info);
      });
    } catch {
      if (__DEV__) console.error("[VOCARA RevenueCat addCustomerInfoListener]");
    }
  }
  return () => {
    customerInfoListeners.delete(listener);
  };
}

export function getActiveProPackage(offerings: PurchasesOfferings | null) {
  const offering = offerings?.current ?? offerings?.all?.["default"] ?? null;
  if (!offering) return null;
  const available = offering.availablePackages ?? [];
  const monthly = available.find((pkg) => pkg.packageType === "MONTHLY");
  const annual = available.find((pkg) => pkg.packageType === "ANNUAL");
  return {
    offering,
    monthly: monthly ?? null,
    annual: annual ?? null,
    fallback: available[0] ?? null,
  };
}

export type RevenueCatErrorResult = {
  isCancellation: boolean;
  userMessage: string;
};

export function normalizeRevenueCatError(error: unknown): RevenueCatErrorResult {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const lowerMessage = rawMessage.toLowerCase();

  const code = (error as { code?: string | number })?.code;
  const userCancelledProp = (error as { userCancelled?: boolean })?.userCancelled;

  if (
    userCancelledProp === true ||
    code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR ||
    lowerMessage.includes("user cancelled") ||
    lowerMessage.includes("user_cancelled") ||
    lowerMessage.includes("purchase cancelled") ||
    lowerMessage.includes("cancellation")
  ) {
    return {
      isCancellation: true,
      userMessage: "Purchase was cancelled.",
    };
  }

  if (lowerMessage.includes("purchases_unavailable")) {
    return {
      isCancellation: false,
      userMessage:
        "In-app purchases require an Expo Development Build and are unavailable in standard Expo Go.",
    };
  }

  if (
    lowerMessage.includes("network") ||
    lowerMessage.includes("internet") ||
    lowerMessage.includes("fetch") ||
    code === PURCHASES_ERROR_CODE.NETWORK_ERROR
  ) {
    return {
      isCancellation: false,
      userMessage:
        "We couldn't connect to the store. Check your connection and try again.",
    };
  }

  if (
    lowerMessage.includes("purchases_unavailable") ||
    lowerMessage.includes("store_problem") ||
    code === PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR
  ) {
    return {
      isCancellation: false,
      userMessage: "Purchases aren't available right now. Try again later.",
    };
  }

  return {
    isCancellation: false,
    userMessage: "We couldn't complete your purchase. Please try again.",
  };
}

/**
 * Whether the RevenueCat dashboard paywall can be presented on this device.
 * False when the native module is missing (e.g. Expo Go) or the public SDK key
 * is not configured. In that case callers should render a custom fallback.
 */
export function isPaywallAvailable(): boolean {
  return isNativePurchasesAvailable && Boolean(getRevenueCatApiKey());
}

export type PaywallPresentResult =
  | { status: "purchased" }
  | { status: "restored" }
  | { status: "cancelled" }
  | { status: "not_presented" }
  | { status: "unavailable"; message: string }
  | { status: "error"; message: string };

function mapPaywallResult(result: PAYWALL_RESULT): PaywallPresentResult {
  switch (result) {
    case PAYWALL_RESULT.PURCHASED:
      return { status: "purchased" };
    case PAYWALL_RESULT.RESTORED:
      return { status: "restored" };
    case PAYWALL_RESULT.CANCELLED:
      return { status: "cancelled" };
    case PAYWALL_RESULT.NOT_PRESENTED:
      return { status: "not_presented" };
    case PAYWALL_RESULT.ERROR:
    default:
      return {
        status: "error",
        message: "The store couldn't be reached. Please try again.",
      };
  }
}

/**
 * Presents the published RevenueCat dashboard paywall (created in the RevenueCat
 * dashboard) for the given entitlement. If the entitlement is already active the
 * SDK will not present the paywall and resolves to "not_presented".
 */
export async function presentPaywallIfNeeded(
  requiredEntitlementIdentifier: string = REVENUECAT_ENTITLEMENTS.PRO,
): Promise<PaywallPresentResult> {
  if (!isPaywallAvailable()) {
    return {
      status: "unavailable",
      message:
        "In-app purchases require an Expo Development Build with RevenueCat configured.",
    };
  }
  try {
    const result = await RevenueCatUI.presentPaywallIfNeeded({
      requiredEntitlementIdentifier,
    });
    return mapPaywallResult(result);
  } catch {
    if (__DEV__) console.error("[VOCARA RevenueCat presentPaywall]");
    return {
      status: "error",
      message: "We couldn't open the upgrade screen. Please try again.",
    };
  }
}

/**
 * Presents the published RevenueCat dashboard paywall for a specific offering.
 */
export async function presentPaywall(
  offering?: PurchasesOffering | null,
): Promise<PaywallPresentResult> {
  if (!isPaywallAvailable()) {
    return {
      status: "unavailable",
      message:
        "In-app purchases require an Expo Development Build with RevenueCat configured.",
    };
  }
  try {
    const result = await RevenueCatUI.presentPaywall(
      offering ? { offering } : undefined,
    );
    return mapPaywallResult(result);
  } catch {
    if (__DEV__) console.error("[VOCARA RevenueCat presentPaywall]");
    return {
      status: "error",
      message: "We couldn't open the upgrade screen. Please try again.",
    };
  }
}



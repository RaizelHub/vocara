import type { PurchasesPackage } from "react-native-purchases";

export function priceLabel(pkg: PurchasesPackage | null): string | null {
  if (!pkg) return null;
  const localized = pkg.product.priceString;
  if (!localized) return null;
  const period = pkg.product.subscriptionPeriod;
  if (period === "P1M") return `${localized}/month`;
  if (period === "P1Y") return `${localized}/year`;
  return localized;
}

export function savingsLabel(
  monthly: PurchasesPackage | null,
  annual: PurchasesPackage | null,
): string | null {
  if (!monthly || !annual) return null;
  const monthlyPrice = monthly.product.price as number | undefined;
  const annualPrice = annual.product.price as number | undefined;
  if (
    typeof monthlyPrice !== "number" ||
    typeof annualPrice !== "number" ||
    monthlyPrice <= 0 ||
    annualPrice <= 0
  ) {
    return null;
  }
  const yearlyEquivalent = monthlyPrice * 12;
  const percent = Math.round((1 - annualPrice / yearlyEquivalent) * 100);
  if (percent < 5) return null;
  return `Save ${percent}%`;
}

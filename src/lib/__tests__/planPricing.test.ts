import { describe, expect, it } from "vitest";

import { priceLabel, savingsLabel } from "@/lib/planPricing";

function pkg(
  overrides: Partial<{
    priceString: string;
    subscriptionPeriod: string;
    price: number;
  }> = {},
) {
  return {
    identifier: "x",
    packageType: "ANNUAL",
    product: {
      price: 9.99,
      priceString: "$9.99",
      subscriptionPeriod: "P1M",
      ...overrides,
    },
  } as never;
}

describe("priceLabel", () => {
  it("formats monthly packages with a /month suffix", () => {
    expect(priceLabel(pkg({ priceString: "$9.99", subscriptionPeriod: "P1M" }))).toBe(
      "$9.99/month",
    );
  });

  it("formats annual packages with a /year suffix", () => {
    expect(priceLabel(pkg({ priceString: "$99.99", subscriptionPeriod: "P1Y" }))).toBe(
      "$99.99/year",
    );
  });

  it("returns the raw string for unknown periods", () => {
    expect(
      priceLabel(pkg({ priceString: "$4.99", subscriptionPeriod: "P3M" })),
    ).toBe("$4.99");
  });

  it("returns null when the package or its price string is missing", () => {
    expect(priceLabel(null)).toBeNull();
    expect(priceLabel(pkg({ priceString: "" }))).toBeNull();
  });
});

describe("savingsLabel", () => {
  it("computes the annual savings percentage", () => {
    const monthly = pkg({ price: 9.99 });
    const annual = pkg({ price: 99.99, subscriptionPeriod: "P1Y" });
    expect(savingsLabel(monthly, annual)).toBe("Save 17%");
  });

  it("hides savings below 5%", () => {
    const monthly = pkg({ price: 10 });
    const annual = pkg({ price: 116, subscriptionPeriod: "P1Y" });
    expect(savingsLabel(monthly, annual)).toBeNull();
  });

  it("returns null when inputs are missing or not numbers", () => {
    expect(savingsLabel(null, pkg())).toBeNull();
    expect(savingsLabel(pkg(), null)).toBeNull();
    expect(savingsLabel(pkg({ price: undefined }), pkg())).toBeNull();
    expect(savingsLabel(pkg({ price: 0 }), pkg())).toBeNull();
  });
});

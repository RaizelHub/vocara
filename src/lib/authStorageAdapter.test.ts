import { expect, it } from "vitest";
import {
  createSecureAuthStorage,
  type StringStore,
} from "./authStorageAdapter";
function store() {
  const values = new Map<string, string>();
  const api: StringStore = {
    getItem: async (k) => values.get(k) ?? null,
    setItem: async (k, v) => {
      values.set(k, v);
    },
    removeItem: async (k) => {
      values.delete(k);
    },
  };
  return { values, api };
}
it("migrates a large unicode session securely and removes plaintext", async () => {
  const secure = store(), legacy = store();
  const value = JSON.stringify({
    token: "synthetic".repeat(500),
    name: "\u6e2c\u8a66".repeat(300),
  });
  legacy.values.set("auth", value);
  const storage = createSecureAuthStorage(secure.api, legacy.api);
  expect(await storage.getItem("auth")).toBe(value);
  expect(legacy.values.has("auth")).toBe(false);
  expect(
    [...secure.values.values()].every((v) =>
      new TextEncoder().encode(v).length < 2048
    ),
  ).toBe(true);
  expect(await storage.getItem("auth")).toBe(value);
});
it("failed refresh preserves the previous secure session", async () => {
  const secure = store(), legacy = store();
  const storage = createSecureAuthStorage(secure.api, legacy.api);
  await storage.setItem("auth", "old-session");
  const write = secure.api.setItem;
  secure.api.setItem = async (k, v) => {
    if (k === "auth") throw new Error("storage full");
    await write(k, v);
  };
  await expect(storage.setItem("auth", "new-session")).rejects.toThrow(
    "storage full",
  );
  expect(await storage.getItem("auth")).toBe("old-session");
});
it("logout clears both secure banks and legacy state without resurrection", async () => {
  const secure = store(), legacy = store();
  const storage = createSecureAuthStorage(secure.api, legacy.api);
  await storage.setItem("auth", "session");
  legacy.values.set("auth", "stale");
  await storage.removeItem("auth");
  expect(await storage.getItem("auth")).toBeNull();
  expect(secure.values.size).toBe(0);
});
it("overlapping refresh writes are serialized", async () => {
  const secure = store(), legacy = store();
  const storage = createSecureAuthStorage(secure.api, legacy.api);
  await Promise.all([
    storage.setItem("auth", "first"),
    storage.setItem("auth", "second"),
  ]);
  expect(await storage.getItem("auth")).toBe("second");
});

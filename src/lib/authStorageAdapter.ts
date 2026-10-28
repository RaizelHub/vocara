export type StringStore = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};
/** Two secure banks keep an interrupted refresh from destroying the last session.
 * All payload chunks are ASCII and <2KB for native secure-store compatibility. */
export function createSecureAuthStorage(
  secure: StringStore,
  legacy: StringStore,
): StringStore {
  let queue = Promise.resolve();
  const serial = <T>(run: () => Promise<T>) => {
    const next = queue.then(run, run);
    queue = next.then(() => {}, () => {});
    return next;
  };
  const manifest = async (key: string) => {
    const raw = await secure.getItem(key);
    if (!raw) return null;
    const m = JSON.parse(raw) as { bank: number; count: number };
    if (
      ![0, 1].includes(m.bank) || !Number.isInteger(m.count) || m.count < 1 ||
      m.count > 128
    ) throw new Error("Invalid secure session");
    return m;
  };
  const write = async (key: string, value: string) => {
    const encoded = encodeURIComponent(value),
      count = Math.max(1, Math.ceil(encoded.length / 1800));
    if (count > 128) throw new Error("Session exceeds secure storage limit");
    const old = await manifest(key), bank = old?.bank === 0 ? 1 : 0;
    for (let i = 0; i < count; i++) {
      await secure.setItem(
        `${key}.${bank}.${i}`,
        encoded.slice(i * 1800, (i + 1) * 1800),
      );
    }
    await secure.setItem(key, JSON.stringify({ bank, count }));
    await legacy.removeItem(key);
    if (old) {
      for (let i = 0; i < old.count; i++) {
        await secure.removeItem(`${key}.${old.bank}.${i}`);
      }
    }
  };
  return {
    getItem: (key) =>
      serial(async () => {
        const m = await manifest(key);
        if (m) {
          let value = "";
          for (let i = 0; i < m.count; i++) {
            const chunk = await secure.getItem(`${key}.${m.bank}.${i}`);
            if (chunk === null) throw new Error("Incomplete secure session");
            value += chunk;
          }
          await legacy.removeItem(key);
          return decodeURIComponent(value);
        }
        const old = await legacy.getItem(key);
        if (old !== null) await write(key, old);
        return old;
      }),
    setItem: (key, value) => serial(() => write(key, value)),
    removeItem: (key) =>
      serial(async () => {
        // Remove legacy first; never resurrect a legacy session after logout.
        await legacy.removeItem(key);
        await secure.removeItem(key);
        for (let bank = 0; bank < 2; bank++) {
          for (let i = 0; i < 128; i++) {
            await secure.removeItem(`${key}.${bank}.${i}`);
          }
        }
      }),
  };
}

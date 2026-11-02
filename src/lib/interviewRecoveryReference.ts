type Store = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Only identifiers: no answers, transcripts, passwords, or audio. Server RLS remains authoritative.
export function createRecoveryReference(store: Store) {
  const key = (owner: string) => `vocara.interview-recovery.${owner}`;
  return {
    async save(owner: string, interview: string) {
      if (!UUID.test(owner) || !UUID.test(interview)) return;
      await store.setItem(key(owner), interview);
    },
    async read(owner: string) {
      if (!UUID.test(owner)) return null;
      const value = await store.getItem(key(owner));
      return value && UUID.test(value) ? value : null;
    },
    async clear(owner: string) { if (UUID.test(owner)) await store.removeItem(key(owner)); },
  };
}

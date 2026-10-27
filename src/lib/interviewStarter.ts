/** Retain one request identity across failures and coalesce concurrent taps. */
export function createInterviewStarter<T>(create: () => T, persist: (session: T) => Promise<unknown>) {
  let session: T | undefined;
  let pending: Promise<T> | null = null;
  let completed = false;
  return {
    get busy() { return pending !== null; },
    get completed() { return completed; },
    run(): Promise<T> {
      if (pending) return pending;
      if (completed) return Promise.resolve(session!);
      session ??= create();
      const current = session;
      pending = Promise.resolve().then(() => persist(current)).then(() => {
        completed = true;
        return current;
      }).finally(() => { pending = null; });
      return pending;
    },
  };
}

/** Shared by Quick Practice's initial attempt and its Retry action. */
export async function runInterviewInitialization<T>(
  starter: ReturnType<typeof createInterviewStarter<T>>,
  callbacks: { loading: () => void; ready: (session: T) => void; failed: (error: unknown) => void },
) {
  if (starter.busy || starter.completed) return;
  callbacks.loading();
  try {
    callbacks.ready(await starter.run());
  } catch (error) {
    callbacks.failed(error);
  }
}

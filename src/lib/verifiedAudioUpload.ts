type UploadInput = { localUri: string; audioPath: string; signal?: AbortSignal };

/** Room-lifetime metadata only. Reuse a confirmed upload if attaching it failed.
 * Unknown/failed uploads still use Storage's existing immutable-path verification.
 */
export function createVerifiedAudioUpload<T>(upload: (input: UploadInput) => Promise<T>) {
  let current: { key: string; result: Promise<T> } | null = null;
  return (input: UploadInput): Promise<T> => {
    const key = JSON.stringify([input.localUri, input.audioPath]);
    if (current?.key === key) return current.result;
    const result = Promise.resolve().then(() => upload(input)).catch(error => {
      if (current?.result === result) current = null;
      throw error;
    });
    current = { key, result };
    return result;
  };
}

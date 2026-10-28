import { expect, it, vi } from 'vitest';
import { createVerifiedAudioUpload } from './verifiedAudioUpload';

it('reuses a confirmed upload when the subsequent attachment needs retry', async () => {
  const upload = vi.fn().mockResolvedValue({ path: 'private/audio.m4a', sizeBytes: 100 });
  const once = createVerifiedAudioUpload(upload);
  const input = { localUri: 'cache/recording.m4a', audioPath: 'private/audio.m4a' };
  const result = await once(input);
  // Attaching the already uploaded object can fail independently of Storage.
  expect(await once(input)).toBe(result);
  expect(upload).toHaveBeenCalledTimes(1);
});
it('coalesces duplicate submissions without caching failed uploads', async () => {
  const upload = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce({ path: 'private/audio.m4a' });
  const once = createVerifiedAudioUpload(upload);
  const input = { localUri: 'cache/recording.m4a', audioPath: 'private/audio.m4a' };
  const first = once(input);
  expect(once(input)).toBe(first);
  await expect(first).rejects.toThrow('timeout');
  await once(input);
  expect(upload).toHaveBeenCalledTimes(2);
});
it('never reuses metadata for a different recording or upload path', async () => {
  const upload = vi.fn().mockResolvedValue({ sizeBytes: 100 });
  const once = createVerifiedAudioUpload(upload);
  await once({ localUri: 'first', audioPath: 'one' });
  await once({ localUri: 'second', audioPath: 'one' });
  await once({ localUri: 'second', audioPath: 'two' });
  expect(upload).toHaveBeenCalledTimes(3);
});

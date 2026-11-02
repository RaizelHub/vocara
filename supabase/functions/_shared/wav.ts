/** Deliberately narrow format: canonical 44-byte PCM WAV, mono, 16-bit, 16 kHz.
 * Duration is derived from bounded sample bytes, never client metadata. */
export function inspectSpeechWav(bytes: Uint8Array) {
  const fail = () => { throw new Error("Invalid canonical speech WAV"); };
  if (bytes.length < 46 || bytes.length > 44+120*32000) return fail();
  const v = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const four = (at: number) => String.fromCharCode(...bytes.subarray(at,at+4));
  if (four(0)!=="RIFF" || four(8)!=="WAVE" || four(12)!=="fmt " || four(36)!=="data" ||
      v.getUint32(4,true)!==bytes.length-8 || v.getUint32(16,true)!==16 ||
      v.getUint16(20,true)!==1 || v.getUint16(22,true)!==1 || v.getUint32(24,true)!==16000 ||
      v.getUint32(28,true)!==32000 || v.getUint16(32,true)!==2 || v.getUint16(34,true)!==16 ||
      v.getUint32(40,true)!==bytes.length-44 || (bytes.length-44)%2!==0) return fail();
  return {durationSeconds:(bytes.length-44)/32000};
}

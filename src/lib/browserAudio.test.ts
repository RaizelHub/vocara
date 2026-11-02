import { expect, it, vi } from "vitest";
import { convertBrowserAudio, encodeSpeechWav, retainRecording, getBrowserRecording, releaseRecording } from "./browserAudio";
it("encodes real mono 16 kHz PCM samples and clamps amplitudes",()=>{
 const bytes=encodeSpeechWav(new Float32Array([-2,0,2,NaN]));const v=new DataView(bytes);
 expect(new TextDecoder().decode(bytes.slice(0,4))).toBe("RIFF");
 expect(v.getUint32(24,true)).toBe(16000);expect(v.getUint16(22,true)).toBe(1);
 expect(v.getInt16(44,true)).toBe(-32768);expect(v.getInt16(48,true)).toBe(32767);expect(v.getInt16(50,true)).toBe(0);
 expect(v.getUint32(40,true)).toBe(8);
});
it("accepts the duration boundary and rejects empty and excessive audio",()=>{
 expect(encodeSpeechWav(new Float32Array(16000*120)).byteLength).toBe(3840044);
 expect(()=>encodeSpeechWav(new Float32Array())).toThrow();
 expect(()=>encodeSpeechWav(new Float32Array(16000*120+1))).toThrow();
});
it("releases private page-memory recordings and rejects arbitrary URLs",()=>{
 const blob=new Blob([encodeSpeechWav(new Float32Array(160))],{type:"audio/wav"});
 const uri=retainRecording(blob);expect(getBrowserRecording(uri)).toBe(blob);
 releaseRecording(uri);expect(()=>getBrowserRecording(uri)).toThrow("unavailable");
 expect(()=>getBrowserRecording("https://example.invalid/private")).toThrow();
});
it("times out a stalled browser decoder so the user can retry",async()=>{
 vi.useFakeTimers();
 vi.stubGlobal("OfflineAudioContext",class {decodeAudioData(){return new Promise(()=>{});}});
 try {
  const conversion=convertBrowserAudio(new Blob([new Uint8Array([1])]));
  const rejected=expect(conversion).rejects.toThrow("Record a shorter answer");
  await vi.advanceTimersByTimeAsync(30000);
  await rejected;
  expect(vi.getTimerCount()).toBe(0);
 } finally {vi.useRealTimers();vi.unstubAllGlobals();}
});

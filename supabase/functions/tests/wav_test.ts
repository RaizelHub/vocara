import { strictEqual, throws } from "node:assert";
import { inspectSpeechWav } from "../_shared/wav.ts";
function wav(seconds=1) {
 const b=new Uint8Array(44+seconds*32000),v=new DataView(b.buffer);
 for(const [at,text] of [[0,"RIFF"],[8,"WAVE"],[12,"fmt "],[36,"data"]] as const) b.set(new TextEncoder().encode(text),at);
 v.setUint32(4,b.length-8,true);v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
 v.setUint32(24,16000,true);v.setUint32(28,32000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);v.setUint32(40,b.length-44,true);return b;
}
Deno.test("WAV duration derives from PCM sample count including 120-second boundary",()=>{
 strictEqual(inspectSpeechWav(wav()).durationSeconds,1);strictEqual(inspectSpeechWav(wav(120)).durationSeconds,120);
 throws(()=>inspectSpeechWav(wav(121)));throws(()=>inspectSpeechWav(wav(0)));
});
Deno.test("WAV rejects forged format, codec, channels, rate, sizes and truncated payload",()=>{
 for(const at of [0,8,12,36,4,16,20,22,24,28,32,34,40]) {const b=wav();b[at]^=1;throws(()=>inspectSpeechWav(b));}
 throws(()=>inspectSpeechWav(wav().subarray(0,100)));throws(()=>inspectSpeechWav(new TextEncoder().encode("not audio")));
});

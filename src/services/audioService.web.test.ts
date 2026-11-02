import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { audioService } from "./audioService.web";
import { encodeSpeechWav, retainRecording, releaseRecording } from "@/lib/browserAudio";
const { getSession }=vi.hoisted(()=>({getSession:vi.fn()}));
vi.mock("@/lib/supabase",()=>({assertSupabaseConfigured:vi.fn(),supabasePublicConfig:{url:"https://fixture.invalid",publishableKey:"synthetic-public"},supabase:{auth:{getSession}}}));
let uri:string;
beforeEach(()=>{getSession.mockResolvedValue({data:{session:{access_token:"synthetic-token"}},error:null});uri=retainRecording(new Blob([encodeSpeechWav(new Float32Array(160))],{type:"audio/wav"}));});
afterEach(()=>{releaseRecording(uri);vi.unstubAllGlobals();});
it("uploads genuine WAV with authenticated immutable storage request",async()=>{
 const fetch=vi.fn().mockResolvedValue(new Response('{}',{status:200}));vi.stubGlobal("fetch",fetch);
 const result=await audioService.uploadAnswerAudio({localUri:uri,audioPath:"u/s/a/file.wav"});
 expect(result.mimeType).toBe("audio/wav");expect(result.sizeBytes).toBe(364);
 expect(fetch.mock.calls[0][1].headers).toMatchObject({"Content-Type":"audio/wav","x-upsert":"false",Authorization:"Bearer synthetic-token"});
});
it("verifies duplicate upload bytes instead of trusting a conflict response",async()=>{
 const blob=new Blob([encodeSpeechWav(new Float32Array(160))],{type:"audio/wav"});
 const fetch=vi.fn().mockResolvedValueOnce(new Response('duplicate',{status:409})).mockResolvedValueOnce(new Response(blob));vi.stubGlobal("fetch",fetch);
 await expect(audioService.uploadAnswerAudio({localUri:uri,audioPath:"u/s/a/file.wav"})).resolves.toMatchObject({sizeBytes:364});
 expect(fetch.mock.calls[1][0]).toContain('/object/authenticated/');
 fetch.mockResolvedValueOnce(new Response('duplicate',{status:409})).mockResolvedValueOnce(new Response('different'));
 await expect(audioService.uploadAnswerAudio({localUri:uri,audioPath:"u/s/a/file.wav"})).rejects.toMatchObject({code:"path_conflict"});
});
it("never sends audio without a session or after cancellation",async()=>{
 const fetch=vi.fn();vi.stubGlobal("fetch",fetch);getSession.mockResolvedValueOnce({data:{session:null},error:null});
 await expect(audioService.uploadAnswerAudio({localUri:uri,audioPath:"u/s/a/file.wav"})).rejects.toMatchObject({code:"unauthorized"});
 await expect(audioService.uploadAnswerAudio({localUri:uri,audioPath:"u/s/a/file.wav",signal:AbortSignal.abort()})).rejects.toMatchObject({code:"cancelled"});
 expect(fetch).not.toHaveBeenCalled();
});
it("keeps the speaking path compatible with server ownership checks",()=>{
 expect(audioService.createSpeakingAttemptPath("user","session","attempt")).toBe("user/session/attempt.wav");
});

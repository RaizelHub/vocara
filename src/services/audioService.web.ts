import { supabase, assertSupabaseConfigured, supabasePublicConfig } from "@/lib/supabase";
import { getBrowserRecording } from "@/lib/browserAudio";
import { AudioUploadError } from "./audioErrors";
export { AudioUploadError, canRetryAudioUpload, audioUploadRequiresAuthentication, getAudioUploadErrorMessage } from "./audioErrors";
export const INTERVIEW_AUDIO_BUCKET="interview-audio", SPEAKING_AUDIO_BUCKET="speaking-audio";
export const ANSWER_AUDIO_MIME_TYPE="audio/wav";
export const MAX_ANSWER_AUDIO_BYTES=5*1024*1024;
export type UploadedAnswerAudio={path:string;mimeType:typeof ANSWER_AUDIO_MIME_TYPE;sizeBytes:number};
type Input={localUri:string;audioPath:string;signal?:AbortSignal};
async function hash(blob:Blob) {return new Uint8Array(await crypto.subtle.digest("SHA-256",await blob.arrayBuffer())).join(",");}
async function upload(bucket:string,input:Input):Promise<UploadedAnswerAudio> {
  assertSupabaseConfigured();
  const blob=getBrowserRecording(input.localUri);
  if(blob.type!==ANSWER_AUDIO_MIME_TYPE || !input.audioPath.endsWith(".wav")) throw new AudioUploadError("unsupported_mime","Recording format is not supported.");
  if(!blob.size || blob.size>MAX_ANSWER_AUDIO_BYTES) throw new AudioUploadError("too_large","Recording is too large.");
  const {data,error}=await supabase.auth.getSession();
  if(error || !data.session) throw new AudioUploadError("unauthorized","Session expired.");
  const controller=new AbortController();let timedOut=false;
  const abort=()=>controller.abort();
  if(input.signal?.aborted) throw new AudioUploadError("cancelled","Upload cancelled.");
  input.signal?.addEventListener("abort",abort,{once:true});
  const timer=setTimeout(()=>{timedOut=true;controller.abort();},45000);
  try {
    const headers={apikey:supabasePublicConfig.publishableKey,Authorization:`Bearer ${data.session.access_token}`};
    const url=`${supabasePublicConfig.url}/storage/v1/object/${bucket}/${input.audioPath.split('/').map(encodeURIComponent).join('/')}`;
    const response=await fetch(url,{method:"POST",headers:{...headers,"Content-Type":ANSWER_AUDIO_MIME_TYPE,"x-upsert":"false"},body:blob,signal:controller.signal});
    if(!response.ok) {
      const message=await response.text();
      if(response.status===409 || /duplicate|already exists/i.test(message)) {
        const existing=await fetch(url.replace('/object/','/object/authenticated/'),{headers,signal:controller.signal});
        const old=existing.ok?await existing.blob():null;
        if(!old || old.size!==blob.size || await hash(old)!==await hash(blob)) throw new AudioUploadError("path_conflict","Could not verify the existing upload.");
      } else {
        const code=response.status===401?"unauthorized":response.status===403?"forbidden":response.status===413?"too_large":response.status===415?"unsupported_mime":"upload_failed";
        throw new AudioUploadError(code,"Storage rejected the upload.");
      }
    }
    return {path:input.audioPath,mimeType:ANSWER_AUDIO_MIME_TYPE,sizeBytes:blob.size};
  } catch(error) {
    if(controller.signal.aborted) throw new AudioUploadError(timedOut?"timeout":"cancelled",timedOut?"Upload timed out.":"Upload cancelled.");
    throw error;
  } finally {clearTimeout(timer);input.signal?.removeEventListener("abort",abort);}
}
async function remove(bucket:string,path:string) {assertSupabaseConfigured();const {error}=await supabase.storage.from(bucket).remove([path]);if(error) throw error;}
async function playback(bucket:string,path:string,seconds:number) {assertSupabaseConfigured();const {data,error}=await supabase.storage.from(bucket).createSignedUrl(path,Math.max(1,Math.min(seconds,300)));if(error) throw error;return data.signedUrl;}
export const audioService={
  createAnswerPath:(user:string,session:string,answer:string)=>`${user}/${session}/${answer}/${crypto.randomUUID()}.wav`,
  createSpeakingAttemptPath:(user:string,session:string,attempt:string)=>`${user}/${session}/${attempt}.wav`,
  uploadAnswerAudio:(input:Input)=>upload(INTERVIEW_AUDIO_BUCKET,input),
  uploadSpeakingAudio:(input:Input)=>upload(SPEAKING_AUDIO_BUCKET,input),
  deleteAnswerAudio:(path:string)=>remove(INTERVIEW_AUDIO_BUCKET,path),
  deleteSpeakingAudio:(path:string)=>remove(SPEAKING_AUDIO_BUCKET,path),
  createPlaybackUrl:(path:string,seconds=60)=>playback(INTERVIEW_AUDIO_BUCKET,path,seconds),
  createSpeakingPlaybackUrl:(path:string,seconds=300)=>playback(SPEAKING_AUDIO_BUCKET,path,seconds),
};

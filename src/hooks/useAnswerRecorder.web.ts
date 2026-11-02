import { useCallback, useEffect, useRef, useState } from "react";
import { convertBrowserAudio, releaseRecording, retainRecording } from "@/lib/browserAudio";

export type MicrophonePermissionState = "unknown" | "granted" | "denied" | "blocked";
export type AnswerRecording = { uri: string; durationMillis: number; durationSeconds: number; sizeBytes: number };
export class MicrophonePermissionError extends Error {
  constructor(public canAskAgain: boolean) { super("Allow microphone access in this site's browser permissions and try again."); }
}
export function getRecorderErrorMessage(error: unknown) {
  if (error instanceof MicrophonePermissionError) return error.message;
  if (error instanceof Error && /HTTPS|unsupported|unavailable|shorter|foreground|busy/i.test(error.message)) return error.message;
  return "Recording could not finish. Check your microphone and browser support, then try again.";
}

export function useAnswerRecorder() {
  const [permission,setPermission] = useState<MicrophonePermissionState>("unknown");
  const [recording,setRecording] = useState<AnswerRecording|null>(null);
  const [error,setError] = useState<string|null>(null);
  const [isRecording,setIsRecording] = useState(false);
  const [durationMillis,setDuration] = useState(0);
  const mounted = useRef(true), generation = useRef(0), busy = useRef(false);
  const media = useRef<MediaRecorder|null>(null), stream = useRef<MediaStream|null>(null);
  const saved = useRef<AnswerRecording|null>(null);
  const completion = useRef<Promise<AnswerRecording>|null>(null);
  const ticker = useRef<ReturnType<typeof setInterval>|null>(null);
  const clearCapture = useCallback(() => {
    if (ticker.current) clearInterval(ticker.current);
    ticker.current=null;
    stream.current?.getTracks().forEach(track=>track.stop()); stream.current=null;
  },[]);
  const stopRecording = useCallback(async () => {
    if (!completion.current) throw new Error("Recording is unavailable.");
    if (media.current?.state === "recording") media.current.stop();
    clearCapture();
    return completion.current;
  },[clearCapture]);
  const startRecording = useCallback(async () => {
    if (busy.current || media.current?.state === "recording") return;
    if (!window.isSecureContext) throw new Error("Microphone recording requires HTTPS or localhost.");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined" || typeof OfflineAudioContext === "undefined") {
      throw new Error("Voice recording is unsupported in this browser. Try a current Chrome, Edge, Firefox or Safari browser.");
    }
    busy.current=true; const current=++generation.current; setError(null);
    try {
      const capture = await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true},video:false});
      if (!mounted.current || current!==generation.current || document.hidden) {
        capture.getTracks().forEach(track=>track.stop()); throw new Error("Keep Vocara in the foreground while starting a recording.");
      }
      stream.current=capture; setPermission("granted");
      const mimeType=["audio/webm;codecs=opus","audio/ogg;codecs=opus","audio/mp4"].find(type=>MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error("Voice recording format is unsupported in this browser.");
      const recorder=new MediaRecorder(capture,{mimeType,audioBitsPerSecond:64000}); media.current=recorder;
      const chunks:Blob[]=[]; let bytes=0, captureError=false;
      completion.current=new Promise<AnswerRecording>((resolve,reject)=>{
        recorder.ondataavailable=e=> { bytes+=e.data.size; if(bytes<=5*1024*1024) chunks.push(e.data); else {captureError=true; if(recorder.state==="recording") recorder.stop();} };
        recorder.onerror=()=> {captureError=true; if(recorder.state==="recording") recorder.stop();};
        recorder.onstop=()=> {
          clearCapture();
          void (async()=>{
            if(!mounted.current || current!==generation.current) throw new Error("Recording cancelled.");
            if(captureError) throw new Error("Recording was interrupted or too large. Record a shorter answer.");
            const result=await convertBrowserAudio(new Blob(chunks,{type:mimeType}));
            if(!mounted.current || current!==generation.current) throw new Error("Recording cancelled.");
            const uri=retainRecording(result.blob);
            releaseRecording(saved.current?.uri??null);
            const next={uri,durationMillis:result.durationMillis,durationSeconds:Math.max(1,Math.round(result.durationMillis/1000)),sizeBytes:result.blob.size};
            saved.current=next; setRecording(next); setDuration(next.durationMillis); setIsRecording(false); resolve(next);
          })().catch(err=>{if(mounted.current && current===generation.current){setIsRecording(false);setError(getRecorderErrorMessage(err));} reject(err);});
        };
      });
      void completion.current.catch(()=>undefined); // Automatic stop may have no awaiting caller.
      recorder.start(250);
      releaseRecording(saved.current?.uri??null);saved.current=null;setRecording(null);setDuration(0);setIsRecording(true);
      const started=performance.now();
      ticker.current=setInterval(()=> { const elapsed=performance.now()-started;setDuration(Math.min(120000,elapsed));if(elapsed>=119500) void stopRecording().catch(()=>undefined); },200);
      capture.getTracks().forEach(track=>track.onended=()=>{void stopRecording().catch(()=>undefined);});
    } catch(err) {
      clearCapture();
      if(err instanceof DOMException && ["NotAllowedError","SecurityError"].includes(err.name)) {if(mounted.current && current===generation.current) setPermission("denied");throw new MicrophonePermissionError(true);}
      if(err instanceof DOMException && ["NotFoundError","NotReadableError"].includes(err.name)) throw new Error("Microphone is unavailable or busy. Check the device and close other recording apps.");
      throw err;
    } finally {busy.current=false;}
  },[clearCapture,stopRecording]);
  const discardRecording=useCallback(async()=>{
    ++generation.current;
    if(media.current?.state==="recording") media.current.stop();
    clearCapture();releaseRecording(saved.current?.uri??null);saved.current=null;completion.current=null;
    setRecording(null);setIsRecording(false);setDuration(0);setError(null);
  },[clearCapture]);
  useEffect(()=>{
    mounted.current=true;
    const hide=()=>{if(document.hidden){if(media.current?.state==="recording") void stopRecording().catch(()=>undefined);else if(busy.current) ++generation.current;}};
    const leave=(event:BeforeUnloadEvent)=>{if(saved.current || media.current?.state==="recording"){event.preventDefault();event.returnValue="";}};
    document.addEventListener("visibilitychange",hide); window.addEventListener("beforeunload",leave);
    return ()=>{
      mounted.current=false;
      // Invalidate the latest operation, including one started after effect setup.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++generation.current;
      if(media.current?.state==="recording") media.current.stop();
      clearCapture();releaseRecording(saved.current?.uri??null);
      document.removeEventListener("visibilitychange",hide);window.removeEventListener("beforeunload",leave);
    };
  },[clearCapture,stopRecording]);
  return {permission,recording,error,isRecording,durationMillis,durationSeconds:recording?.durationSeconds??Math.floor(durationMillis/1000),startRecording,stopRecording,discardRecording};
}

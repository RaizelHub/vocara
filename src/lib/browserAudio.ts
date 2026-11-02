// Recordings live only in this page's memory. Never persist audio in browser storage.
const recordings = new Map<string, Blob>();
export function retainRecording(blob: Blob) {
  const uri = URL.createObjectURL(blob);
  recordings.set(uri, blob);
  return uri;
}
export function getBrowserRecording(uri: string) {
  const blob = recordings.get(uri);
  if (!blob) throw new Error("The recording is unavailable. Record your answer again.");
  return blob;
}
export function releaseRecording(uri: string | null) {
  if (!uri) return;
  recordings.delete(uri);
  URL.revokeObjectURL(uri);
}
export function encodeSpeechWav(samples: Float32Array) {
  if (!samples.length || samples.length > 16000 * 120) throw new Error("Recording must be between zero and 120 seconds.");
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (at: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i)); };
  text(0,"RIFF"); view.setUint32(4,buffer.byteLength-8,true); text(8,"WAVE");
  text(12,"fmt "); view.setUint32(16,16,true); view.setUint16(20,1,true);
  view.setUint16(22,1,true); view.setUint32(24,16000,true); view.setUint32(28,32000,true);
  view.setUint16(32,2,true); view.setUint16(34,16,true); text(36,"data"); view.setUint32(40,samples.length*2,true);
  for (let i=0;i<samples.length;i++) {
    const sample = Number.isFinite(samples[i]) ? Math.max(-1,Math.min(1,samples[i])) : 0;
    view.setInt16(44+i*2,Math.round(sample*(sample<0?32768:32767)),true);
  }
  return buffer;
}
export async function convertBrowserAudio(blob: Blob) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      decodeBrowserAudio(blob),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Recording conversion is unavailable. Record a shorter answer and try again.")), 30000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function decodeBrowserAudio(blob: Blob) {
  if (!blob.size || blob.size > 5*1024*1024) throw new Error("Recording is empty or too large. Record a shorter answer.");
  // Decode the real browser container; never relabel WebM/Ogg as WAV or M4A.
  const decoder = new OfflineAudioContext(1, 1, 16000);
  const audio = await decoder.decodeAudioData(await blob.arrayBuffer());
  if (!Number.isFinite(audio.duration) || audio.duration <= 0 || audio.duration > 120.5 || audio.numberOfChannels > 2) {
    throw new Error("Recording duration or channels are unsupported. Record a shorter answer.");
  }
  const frames = Math.min(120*16000,Math.ceil(audio.duration*16000));
  const renderer = new OfflineAudioContext(1,frames,16000);
  const source = renderer.createBufferSource(); source.buffer = audio;
  source.connect(renderer.destination); source.start();
  const mono = await renderer.startRendering();
  return { blob: new Blob([encodeSpeechWav(mono.getChannelData(0))],{type:"audio/wav"}), durationMillis: frames/16 };
}

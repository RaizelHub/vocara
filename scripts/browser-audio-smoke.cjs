// Real Chromium capture/conversion with a synthetic microphone; no backend or AI requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const ts = require('typescript');
const { chromium } = require(process.env.VOCARA_PLAYWRIGHT_MODULE || 'playwright');

async function main() {
  const source = ts.transpileModule(fs.readFileSync('src/lib/browserAudio.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText;
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', request.url === '/audio.js' ? 'text/javascript' : 'text/html');
    response.end(request.url === '/audio.js' ? source : '<!doctype html><title>Audio fixture</title>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
    const context = await browser.newContext({ permissions: ['microphone'] });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage();
    await page.goto(origin);
    const result = await page.evaluate(async () => {
      // Served by this fixture's local HTTP server.
      // eslint-disable-next-line import/no-unresolved
      const audio = await import('/audio.js');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      try {
        const type = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find(value => MediaRecorder.isTypeSupported(value));
        const recorder = new MediaRecorder(stream, { mimeType: type });
        const chunks = [];
        const stopped = new Promise(resolve => { recorder.onstop = resolve; });
        recorder.ondataavailable = event => chunks.push(event.data);
        recorder.start(250);
        await new Promise(resolve => setTimeout(resolve, 1800));
        recorder.stop();
        await stopped;
        stream.getTracks().forEach(track => track.stop());
        const converted = await audio.convertBrowserAudio(new Blob(chunks, { type }));
        const bytes = await converted.blob.arrayBuffer();
        const view = new DataView(bytes);
        const uri = audio.retainRecording(converted.blob);
        const memoryMatches = audio.getBrowserRecording(uri) === converted.blob;
        audio.releaseRecording(uri);
        let released = false;
        try { audio.getBrowserRecording(uri); } catch { released = true; }
        return { type, mime: converted.blob.type, size: bytes.byteLength, magic: new TextDecoder().decode(bytes.slice(0, 4)), rate: view.getUint32(24, true), channels: view.getUint16(22, true), duration: converted.durationMillis, tracksEnded: stream.getTracks().every(track => track.readyState === 'ended'), memoryMatches, released };
      } finally { stream.getTracks().forEach(track => track.stop()); }
    });
    assert.equal(result.mime, 'audio/wav');
    assert.equal(result.magic, 'RIFF');
    assert.equal(result.rate, 16000);
    assert.equal(result.channels, 1);
    assert.ok(result.duration > 1000 && result.duration < 4000);
    assert.equal(result.size, 44 + result.duration * 32);
    assert.ok(result.tracksEnded && result.memoryMatches && result.released);
    console.log('PASS real Chromium synthetic microphone capture, browser container decoding, PCM WAV conversion and memory release', result);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

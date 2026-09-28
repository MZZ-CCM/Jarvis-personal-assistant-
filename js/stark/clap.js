// Double-clap to summon Jarvis.
// The microphone signal is analysed on this device only — it measures loudness
// spikes, never records, never recognises speech, never sends audio anywhere.

let ctx = null, stream = null, raf = 0;
let onDouble = null;
let armed = false;

export const clapArmed = () => armed;

export async function armClap(callback) {
  onDouble = callback;
  if (armed) return;
  stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  src.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  armed = true;

  let noise = 0.01;       // running background level
  let lastPeak = 0;       // time of last detected clap
  let quietSince = 0;     // claps are short: must drop back quickly
  let inPeak = false, peakStart = 0;

  const loop = () => {
    analyser.getFloatTimeDomainData(buf);
    let sum = 0, max = 0;
    for (let i = 0; i < buf.length; i++) { const v = Math.abs(buf[i]); sum += v * v; if (v > max) max = v; }
    const rms = Math.sqrt(sum / buf.length);
    const now = performance.now();

    if (!inPeak && max > 0.35 && rms > noise * 6) {
      inPeak = true; peakStart = now;
    } else if (inPeak && rms < noise * 3) {
      inPeak = false;
      const duration = now - peakStart;
      if (duration < 160) { // a clap, not speech or music
        if (now - lastPeak > 180 && now - lastPeak < 750) {
          lastPeak = 0;
          onDouble?.();
        } else {
          lastPeak = now;
        }
      }
      quietSince = now;
    }
    if (!inPeak) noise = noise * 0.995 + rms * 0.005;
    raf = requestAnimationFrame(loop);
  };
  loop();
}

export function disarmClap() {
  cancelAnimationFrame(raf);
  stream?.getTracks().forEach((t) => t.stop());
  ctx?.close().catch(() => {});
  ctx = null; stream = null; armed = false;
}

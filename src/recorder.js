// CanvasRecorder — real-time capture of the running experience to a .webm the
// browser downloads. Video is the live WebGL canvas (captureStream); audio is a
// tap on the AudioEngine master bus, so picture and the exact track you hear
// stay locked in sync with no extra work. Convert the .webm to a YouTube-ready
// .mp4 afterwards with one ffmpeg command (see the README).
//
// Wired to ?record=1 in main.js: enter the world with a track loaded and it
// captures the autopilot "walk the line" demo for the whole track, then saves.

export class CanvasRecorder {
  constructor(canvas, audio) {
    this.canvas = canvas;
    this.audio = audio;
    this.rec = null;
    this.chunks = [];
    this.recording = false;
  }

  static supported() {
    return typeof window !== "undefined" &&
      "MediaRecorder" in window &&
      typeof HTMLCanvasElement.prototype.captureStream === "function";
  }

  // Pick the best webm codec the browser will actually record (VP9 > VP8).
  _mime() {
    const want = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ];
    for (const m of want) {
      if (window.MediaRecorder.isTypeSupported && window.MediaRecorder.isTypeSupported(m)) return m;
    }
    return "";
  }

  // fps: capture rate. bitrate: video bits/s (12 Mbps ≈ crisp 1080p).
  start({ fps = 60, bitrate = 12_000_000 } = {}) {
    if (this.recording || !CanvasRecorder.supported()) return false;

    const video = this.canvas.captureStream(fps);
    const stream = new MediaStream(video.getVideoTracks());
    const audioStream = this.audio.captureAudioStream && this.audio.captureAudioStream();
    if (audioStream) for (const t of audioStream.getAudioTracks()) stream.addTrack(t);

    const mimeType = this._mime();
    const opts = { videoBitsPerSecond: bitrate };
    if (mimeType) opts.mimeType = mimeType;

    this.rec = new MediaRecorder(stream, opts);
    this.chunks = [];
    this.rec.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
    this.rec.onstop = () => this._download();
    this.rec.start(1000); // 1s timeslices — resilient if the tab dies mid-capture
    this.recording = true;
    return true;
  }

  stop() {
    if (!this.recording) return;
    this.recording = false;
    try { this.rec.stop(); } catch { /* already stopped */ }
  }

  _download() {
    if (!this.chunks.length) return;
    const type = (this.rec && this.rec.mimeType) || "video/webm";
    const blob = new Blob(this.chunks, { type });
    this.chunks = [];
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    a.href = url;
    a.download = `supervuoto-walk-${stamp}.webm`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

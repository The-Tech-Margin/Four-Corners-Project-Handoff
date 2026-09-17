/**
 * @module media/AudioEngine
 * MediaRecorder wrapper with waveform generation.
 *
 * iOS Safari gotcha: A single getUserMedia stream must be shared between
 * the recorder and any visualizer (AnalyserNode). Creating multiple streams
 * will silently fail on iOS Safari. Always reuse `this.stream`.
 */

/**
 * Manages audio recording via MediaRecorder and waveform analysis
 * via the Web Audio API.
 */
export class AudioEngine {
  /** Active MediaRecorder instance. */
  private recorder: MediaRecorder | null = null;

  /** Active media stream from getUserMedia. */
  private stream: MediaStream | null = null;

  /** Collected audio data chunks during recording. */
  private chunks: Blob[] = [];

  /**
   * Start recording audio from the user's microphone.
   * Requests microphone access, detects the best supported MIME type,
   * and begins collecting audio chunks.
   */
  async startRecording(): Promise<void> {
    this.chunks = [];
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const mimeType = AudioEngine.detectMimeType();
    const options: MediaRecorderOptions = mimeType ? { mimeType } : {};

    this.recorder = new MediaRecorder(this.stream, options);
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.chunks.push(e.data);
      }
    };

    this.recorder.start();
  }

  /**
   * Stop recording and return the assembled audio Blob.
   * @returns The recorded audio as a Blob.
   */
  stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.recorder || this.recorder.state === 'inactive') {
        reject(new Error('AudioEngine: No active recording to stop.'));
        return;
      }

      this.recorder.onstop = () => {
        const mimeType = this.recorder?.mimeType || 'audio/webm';
        const blob = new Blob(this.chunks, { type: mimeType });
        this.chunks = [];
        resolve(blob);
      };

      this.recorder.stop();
    });
  }

  /**
   * Check whether recording is currently in progress.
   * @returns True if the recorder is active.
   */
  isRecording(): boolean {
    return this.recorder?.state === 'recording';
  }

  /**
   * Detect the best supported audio MIME type for MediaRecorder.
   * Priority: audio/webm;codecs=opus → audio/webm → audio/mp4 → audio/wav.
   * @returns The first supported MIME type string, or empty string if none.
   */
  static detectMimeType(): string {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/wav',
    ];

    for (const mime of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) {
        return mime;
      }
    }

    return '';
  }

  /**
   * Generate a normalized waveform amplitude array from an audio Blob.
   * Uses the Web Audio API's OfflineAudioContext to decode and analyze.
   * @param blob - Audio data blob.
   * @returns Normalized amplitude array (values 0–1).
   */
  static async generateWaveform(blob: Blob): Promise<Float32Array> {
    const arrayBuffer = await blob.arrayBuffer();
    const audioCtx = new OfflineAudioContext(1, 44100 * 60, 44100);
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    const rawData = audioBuffer.getChannelData(0);
    const samples = 100;
    const blockSize = Math.floor(rawData.length / samples);
    const waveform = new Float32Array(samples);

    let maxAmplitude = 0;
    for (let i = 0; i < samples; i++) {
      let sum = 0;
      const start = i * blockSize;
      for (let j = start; j < start + blockSize && j < rawData.length; j++) {
        sum += Math.abs(rawData[j]);
      }
      waveform[i] = sum / blockSize;
      if (waveform[i] > maxAmplitude) {
        maxAmplitude = waveform[i];
      }
    }

    // Normalize to 0–1
    if (maxAmplitude > 0) {
      for (let i = 0; i < samples; i++) {
        waveform[i] /= maxAmplitude;
      }
    }

    return waveform;
  }

  /**
   * Stop stream tracks and clean up resources.
   */
  destroy(): void {
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.stop();
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.recorder = null;
    this.stream = null;
    this.chunks = [];
  }
}

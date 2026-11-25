/**
 * Synthesizes a clean, warm stereo ambient audio loop (WAV) for the starter sequence
 * and provides fast waveform peak extraction for uploaded audio/video files.
 */

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = length * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(buffer.getChannelData(ch));
  }

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

export function computeWaveformPeaks(buffer: AudioBuffer, buckets = 96): number[] {
  const channelData = buffer.getChannelData(0);
  const step = Math.max(1, Math.floor(channelData.length / buckets));
  const peaks: number[] = [];

  for (let i = 0; i < buckets; i++) {
    const start = i * step;
    const end = Math.min(channelData.length, start + step);
    let maxVal = 0;
    for (let j = start; j < end; j += Math.max(1, Math.floor(step / 16))) {
      const abs = Math.abs(channelData[j]);
      if (abs > maxVal) maxVal = abs;
    }
    peaks.push(Math.min(1, Math.max(0.08, maxVal)));
  }

  return peaks;
}

export async function extractWaveformFromUrl(url: string, buckets = 96): Promise<{ peaks: number[]; duration: number }> {
  try {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    try {
      const decoded = await ctx.decodeAudioData(arrayBuffer);
      return {
        peaks: computeWaveformPeaks(decoded, buckets),
        duration: decoded.duration,
      };
    } finally {
      await ctx.close();
    }
  } catch {
    return {
      peaks: Array.from({ length: buckets }, (_, i) => 0.25 + 0.35 * Math.abs(Math.sin(i * 0.45))),
      duration: 5,
    };
  }
}

export function createSampleAmbientTrack(durationSeconds = 12): { url: string; waveform: number[]; duration: number } {
  const sampleRate = 44100;
  const totalSamples = Math.floor(sampleRate * durationSeconds);

  // Build stereo Float32 arrays directly (no async OfflineAudioContext delay needed at boot)
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);

  // Warm chord progression: Fmaj7 -> G6 -> Em7 -> Am9 (3s per bar)
  const chords = [
    [174.61, 220.0, 261.63, 329.63], // Fmaj7
    [196.0, 246.94, 293.66, 329.63], // G6
    [164.81, 196.0, 246.94, 293.66], // Em7
    [110.0, 164.81, 220.0, 261.63, 329.63], // Am7
  ];

  const barDuration = 3.0;
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const barIdx = Math.min(chords.length - 1, Math.floor(t / barDuration));
    const localT = t - barIdx * barDuration;
    const chord = chords[barIdx];

    // Soft pad envelope per chord
    const attack = Math.min(1, localT / 0.35);
    const release = Math.min(1, (barDuration - localT) / 0.45);
    const padEnv = attack * release;

    // Gentle pulse every 0.5s (120 BPM)
    const beatPhase = (t * 2) % 1;
    const pulseEnv = Math.exp(-beatPhase * 4.5);

    let padL = 0;
    let padR = 0;
    for (let n = 0; n < chord.length; n++) {
      const freq = chord[n];
      const detune = n % 2 === 0 ? 1.0015 : 0.9985;
      const s1 = Math.sin(2 * Math.PI * freq * t);
      const s2 = Math.sin(2 * Math.PI * freq * detune * t) * 0.4;
      const pan = n / Math.max(1, chord.length - 1); // 0..1
      const val = (s1 + s2) / chord.length;
      padL += val * (1 - pan * 0.35);
      padR += val * (0.65 + pan * 0.35);
    }

    // Subtle sub-pulse
    const bassFreq = chord[0] * 0.5;
    const bass = Math.sin(2 * Math.PI * bassFreq * t) * pulseEnv * 0.22;

    // Master fade-in / fade-out
    const masterIn = Math.min(1, t / 0.4);
    const masterOut = Math.min(1, (durationSeconds - t) / 0.8);
    const master = masterIn * masterOut * 0.42;

    left[i] = (padL * padEnv * 0.72 + bass) * master;
    right[i] = (padR * padEnv * 0.72 + bass) * master;
  }

  // Write WAV directly
  const bytesPerSample = 2;
  const blockAlign = 2 * bytesPerSample;
  const dataSize = totalSamples * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < totalSamples; i++) {
    const l = Math.max(-1, Math.min(1, left[i]));
    const r = Math.max(-1, Math.min(1, right[i]));
    view.setInt16(offset, l < 0 ? l * 0x8000 : l * 0x7fff, true);
    view.setInt16(offset + 2, r < 0 ? r * 0x8000 : r * 0x7fff, true);
    offset += 4;
  }

  const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);

  // Compute 96 waveform peaks
  const buckets = 96;
  const step = Math.floor(totalSamples / buckets);
  const waveform: number[] = [];
  for (let b = 0; b < buckets; b++) {
    let peak = 0;
    const start = b * step;
    for (let j = start; j < start + step; j += 32) {
      const a = Math.abs(left[j]);
      if (a > peak) peak = a;
    }
    waveform.push(Math.min(1, Math.max(0.12, peak * 2.2)));
  }

  return { url, waveform, duration: durationSeconds };
}

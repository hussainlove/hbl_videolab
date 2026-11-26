/**
 * Synthesizes clean stereo WAV audio tracks & famous sound VFX (UI clicks, file drop,
 * keyboard typing, whooshes, bass drops, social dings, etc.) offline without large static assets,
 * and provides fast waveform peak extraction for uploaded audio/video files.
 */

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function encodeStereoWav(
  left: Float32Array,
  right: Float32Array,
  sampleRate = 44100
): { blob: Blob; url: string; waveform: number[] } {
  const totalSamples = left.length;
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

  const buckets = 96;
  const step = Math.max(1, Math.floor(totalSamples / buckets));
  const waveform: number[] = [];
  const stride = Math.max(1, Math.floor(step / 12));
  for (let b = 0; b < buckets; b++) {
    let peak = 0;
    const start = b * step;
    const end = Math.min(totalSamples, start + step);
    for (let j = start; j < end; j += stride) {
      const a = Math.max(Math.abs(left[j]), Math.abs(right[j]));
      if (a > peak) peak = a;
    }
    waveform.push(Math.min(1, Math.max(0.08, peak * 1.45)));
  }

  return { blob, url, waveform };
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

  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);

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

    const attack = Math.min(1, localT / 0.35);
    const release = Math.min(1, (barDuration - localT) / 0.45);
    const padEnv = attack * release;

    const beatPhase = (t * 2) % 1;
    const pulseEnv = Math.exp(-beatPhase * 4.5);

    let padL = 0;
    let padR = 0;
    for (let n = 0; n < chord.length; n++) {
      const freq = chord[n];
      const detune = n % 2 === 0 ? 1.0015 : 0.9985;
      const s1 = Math.sin(2 * Math.PI * freq * t);
      const s2 = Math.sin(2 * Math.PI * freq * detune * t) * 0.4;
      const pan = n / Math.max(1, chord.length - 1);
      const val = (s1 + s2) / chord.length;
      padL += val * (1 - pan * 0.35);
      padR += val * (0.65 + pan * 0.35);
    }

    const bassFreq = chord[0] * 0.5;
    const bass = Math.sin(2 * Math.PI * bassFreq * t) * pulseEnv * 0.22;

    const masterIn = Math.min(1, t / 0.4);
    const masterOut = Math.min(1, (durationSeconds - t) / 0.8);
    const master = masterIn * masterOut * 0.42;

    left[i] = (padL * padEnv * 0.72 + bass) * master;
    right[i] = (padR * padEnv * 0.72 + bass) * master;
  }

  const { url, waveform } = encodeStereoWav(left, right, sampleRate);
  return { url, waveform, duration: durationSeconds };
}

export type SfxCategory = 'UI & Typing' | 'Drops & Whoosh' | 'Social & Creator' | 'Cinematic';

export interface SfxPresetInfo {
  id: string;
  label: string;
  category: SfxCategory;
  description: string;
  duration: number;
  accent: string;
}

export const FAMOUS_SFX_CATALOG: SfxPresetInfo[] = [
  // UI & Typing
  {
    id: 'sfx-mouse-click',
    label: 'Mouse Click',
    category: 'UI & Typing',
    description: 'Crisp tactile single mouse click',
    duration: 0.18,
    accent: '#38BDF8',
  },
  {
    id: 'sfx-double-click',
    label: 'Double Click',
    category: 'UI & Typing',
    description: 'Clean double-tap mouse click',
    duration: 0.32,
    accent: '#0EA5E9',
  },
  {
    id: 'sfx-file-drop',
    label: 'File Drop Pop',
    category: 'UI & Typing',
    description: 'Smooth drag-and-drop file placement pop',
    duration: 0.38,
    accent: '#34D399',
  },
  {
    id: 'sfx-keyboard-typing',
    label: 'Keyboard Typing',
    category: 'UI & Typing',
    description: 'Mechanical keyboard fast typing burst',
    duration: 1.85,
    accent: '#A78BFA',
  },
  {
    id: 'sfx-typewriter',
    label: 'Typewriter + Ding',
    category: 'UI & Typing',
    description: 'Retro typewriter keys + carriage bell ding',
    duration: 1.65,
    accent: '#F59E0B',
  },
  {
    id: 'sfx-pop-bubble',
    label: 'Pop Bubble',
    category: 'UI & Typing',
    description: 'Viral upward pop sound for text & icons',
    duration: 0.28,
    accent: '#EC4899',
  },
  {
    id: 'sfx-notify-ping',
    label: 'Notification Ping',
    category: 'UI & Typing',
    description: 'Bright glassy alert chime ping',
    duration: 0.7,
    accent: '#22D3EE',
  },
  {
    id: 'sfx-ui-toggle',
    label: 'UI Switch Tick',
    category: 'UI & Typing',
    description: 'Subtle modern toggle click',
    duration: 0.2,
    accent: '#60A5FA',
  },

  // Drops & Whoosh
  {
    id: 'sfx-whoosh-fast',
    label: 'Fast Whoosh',
    category: 'Drops & Whoosh',
    description: 'Punchy transition air whip whoosh',
    duration: 0.6,
    accent: '#38BDF8',
  },
  {
    id: 'sfx-swoosh-soft',
    label: 'Soft Swoosh',
    category: 'Drops & Whoosh',
    description: 'Silky slide transition air swoosh',
    duration: 0.8,
    accent: '#818CF8',
  },
  {
    id: 'sfx-vine-boom',
    label: 'Vine Boom / Drop',
    category: 'Drops & Whoosh',
    description: 'Iconic viral heavy sub-bass boom drop',
    duration: 1.35,
    accent: '#EF4444',
  },
  {
    id: 'sfx-glitch-buzz',
    label: 'Digital Glitch',
    category: 'Drops & Whoosh',
    description: 'Cyber stutter zap transition hit',
    duration: 0.48,
    accent: '#C084FC',
  },
  {
    id: 'sfx-cinematic-riser',
    label: 'Sweep Riser',
    category: 'Drops & Whoosh',
    description: 'Ascending tension riser build-up',
    duration: 2.2,
    accent: '#F97316',
  },
  {
    id: 'sfx-cinematic-hit',
    label: 'Trailer Impact',
    category: 'Drops & Whoosh',
    description: 'Deep cinematic trailer slam impact',
    duration: 1.6,
    accent: '#DC2626',
  },

  // Social & Creator
  {
    id: 'sfx-camera-shutter',
    label: 'Camera Shutter',
    category: 'Social & Creator',
    description: 'Classic DSLR double-curtain photo snap',
    duration: 0.4,
    accent: '#FBBF24',
  },
  {
    id: 'sfx-subscribe-bell',
    label: 'Subscribe Bell',
    category: 'Social & Creator',
    description: 'Bright YouTube bell notification ding',
    duration: 1.0,
    accent: '#EF4444',
  },
  {
    id: 'sfx-coin-cash',
    label: 'Coin / Cha-Ching',
    category: 'Social & Creator',
    description: 'Classic two-note coin & cash chime',
    duration: 0.85,
    accent: '#10B981',
  },
  {
    id: 'sfx-correct-chime',
    label: 'Success Ding',
    category: 'Social & Creator',
    description: 'Clean ascending positive answer chime',
    duration: 0.85,
    accent: '#34D399',
  },
  {
    id: 'sfx-wrong-buzzer',
    label: 'Wrong Buzzer',
    category: 'Social & Creator',
    description: 'Classic game-show wrong answer buzz',
    duration: 0.7,
    accent: '#F43F5E',
  },
  {
    id: 'sfx-rimshot',
    label: 'Ba-Dum-Tss',
    category: 'Social & Creator',
    description: 'Comedy drum rimshot punchline hit',
    duration: 1.15,
    accent: '#F59E0B',
  },
  {
    id: 'sfx-sparkle-magic',
    label: 'Magic Sparkles',
    category: 'Social & Creator',
    description: 'Shimmering fairy-dust ascending chimes',
    duration: 1.25,
    accent: '#E879F9',
  },
  {
    id: 'sfx-countdown-beep',
    label: 'Timer Beep',
    category: 'Social & Creator',
    description: 'Crisp countdown 3-2-1 start tone',
    duration: 0.45,
    accent: '#22D3EE',
  },

  // Cinematic
  {
    id: 'sfx-heartbeat',
    label: 'Heartbeat Thump',
    category: 'Cinematic',
    description: 'Dramatic lub-dub heartbeat sub pulse',
    duration: 1.35,
    accent: '#FB7185',
  },
  {
    id: 'sfx-vinyl-scratch',
    label: 'Record Scratch',
    category: 'Cinematic',
    description: 'Record brake spin-down comedy stop',
    duration: 0.6,
    accent: '#94A3B8',
  },
];

function pseudoRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return ((s >>> 0) / 4294967296) * 2 - 1;
  };
}

const synthesizedSfxCache = new Map<
  string,
  { blob: Blob; url: string; waveform: number[]; duration: number }
>();

export function synthesizeSfxTrack(presetId: string): {
  blob: Blob;
  url: string;
  waveform: number[];
  duration: number;
} {
  const existing = synthesizedSfxCache.get(presetId);
  if (existing) return existing;

  const preset = FAMOUS_SFX_CATALOG.find((s) => s.id === presetId) ?? FAMOUS_SFX_CATALOG[0];
  const sampleRate = 44100;
  const duration = preset.duration;
  const totalSamples = Math.max(1024, Math.floor(sampleRate * duration));
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);
  const rand = pseudoRandom(
    preset.id.split('').reduce((acc, ch) => acc * 31 + ch.charCodeAt(0), 7)
  );

  const addClickImpulse = (startSec: number, pitch = 1900, amp = 0.85, pan = 0) => {
    const startIdx = Math.floor(startSec * sampleRate);
    const len = Math.floor(0.038 * sampleRate);
    const lGain = 1 - Math.max(0, pan) * 0.45;
    const rGain = 1 - Math.max(0, -pan) * 0.45;
    for (let k = 0; k < len; k++) {
      const idx = startIdx + k;
      if (idx >= totalSamples) break;
      const lt = k / sampleRate;
      const env = Math.exp(-lt * 165);
      const body =
        Math.sin(2 * Math.PI * (pitch * Math.exp(-lt * 35)) * lt) * 0.65 +
        Math.sin(2 * Math.PI * (pitch * 2.15) * lt) * 0.25 +
        rand() * 0.45 * Math.exp(-lt * 260);
      const s = body * env * amp;
      left[idx] += s * lGain;
      right[idx] += s * rGain;
    }
  };

  if (preset.id === 'sfx-mouse-click' || preset.id === 'sfx-ui-toggle') {
    const basePitch = preset.id === 'sfx-ui-toggle' ? 1450 : 2250;
    addClickImpulse(0.012, basePitch, 0.9, 0);
    addClickImpulse(0.032, basePitch * 0.72, 0.45, 0);
  } else if (preset.id === 'sfx-double-click') {
    addClickImpulse(0.012, 2350, 0.9, -0.15);
    addClickImpulse(0.03, 1750, 0.4, -0.15);
    addClickImpulse(0.145, 2450, 0.9, 0.15);
    addClickImpulse(0.163, 1820, 0.4, 0.15);
  } else if (preset.id === 'sfx-file-drop') {
    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      const thudEnv = Math.exp(-t * 28);
      const thudFreq = 190 - 95 * Math.min(1, t / 0.09);
      const thud = Math.sin(2 * Math.PI * thudFreq * t) * thudEnv * 0.65;
      const popT = Math.max(0, t - 0.045);
      const popEnv = t >= 0.045 ? Math.exp(-popT * 24) * Math.min(1, popT / 0.006) : 0;
      const popFreq = 420 + 540 * Math.min(1, popT / 0.08);
      const pop = Math.sin(2 * Math.PI * popFreq * popT) * popEnv * 0.55;
      left[i] = thud + pop;
      right[i] = thud + pop * 0.96;
    }
  } else if (preset.id === 'sfx-keyboard-typing') {
    const times = [
      0.04, 0.14, 0.23, 0.34, 0.43, 0.55, 0.64, 0.76, 0.85, 0.95, 1.07, 1.18, 1.29, 1.4,
      1.52, 1.64,
    ];
    times.forEach((ts, idx) => {
      const isSpace = idx === 5 || idx === 11;
      const pitch = isSpace ? 950 : 1650 + ((idx * 271) % 700);
      const pan = ((idx % 5) - 2) * 0.22;
      addClickImpulse(ts, pitch, isSpace ? 0.85 : 0.72, pan);
    });
  } else if (preset.id === 'sfx-typewriter') {
    const keys = [0.04, 0.16, 0.28, 0.4, 0.52, 0.65, 0.78, 0.91, 1.04];
    keys.forEach((ts, idx) => {
      addClickImpulse(ts, 2100 + (idx % 4) * 260, 0.8, ((idx % 3) - 1) * 0.18);
    });
    const bellStart = 1.16;
    for (let i = Math.floor(bellStart * sampleRate); i < totalSamples; i++) {
      const lt = i / sampleRate - bellStart;
      const env = Math.exp(-lt * 6.5) * Math.min(1, lt / 0.004);
      const bell =
        Math.sin(2 * Math.PI * 2093 * lt) * 0.55 +
        Math.sin(2 * Math.PI * 4186 * lt) * 0.28 +
        Math.sin(2 * Math.PI * 6279 * lt) * 0.12;
      left[i] += bell * env * 0.75;
      right[i] += bell * env * 0.78;
    }
  } else if (preset.id === 'sfx-pop-bubble') {
    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      const env = Math.exp(-t * 22) * Math.min(1, t / 0.005);
      const freq = 280 + 780 * Math.min(1, t / 0.11);
      const s = Math.sin(2 * Math.PI * freq * t) * env * 0.82;
      left[i] = s;
      right[i] = s;
    }
  } else if (preset.id === 'sfx-notify-ping') {
    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      const n1 = Math.sin(2 * Math.PI * 987.77 * t) * Math.exp(-t * 8.5);
      const t2 = Math.max(0, t - 0.09);
      const n2 =
        t >= 0.09
          ? (Math.sin(2 * Math.PI * 1318.51 * t2) + 0.3 * Math.sin(2 * Math.PI * 2637.02 * t2)) *
            Math.exp(-t2 * 6.2)
          : 0;
      const s = (n1 * 0.45 + n2 * 0.6) * Math.min(1, t / 0.005);
      left[i] = s;
      right[i] = s * 0.96;
    }
  } else if (preset.id === 'sfx-whoosh-fast' || preset.id === 'sfx-swoosh-soft') {
    const isFast = preset.id === 'sfx-whoosh-fast';
    let lpL = 0;
    let lpR = 0;
    let prevL = 0;
    let prevR = 0;
    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      const norm = t / duration;
      const peakPos = isFast ? 0.36 : 0.48;
      const env = Math.exp(-Math.pow((norm - peakPos) / (isFast ? 0.24 : 0.3), 2));
      const cutoff = 0.04 + 0.38 * env;
      const nL = rand();
      const nR = rand();
      lpL += cutoff * (nL - lpL);
      lpR += cutoff * (nR - lpR);
      const hpL = lpL - prevL * 0.72;
      const hpR = lpR - prevR * 0.72;
      prevL = lpL;
      prevR = lpR;
      const pan = (norm - 0.5) * 1.1;
      const tone = Math.sin(2 * Math.PI * (90 + 240 * env) * t) * 0.2;
      left[i] = (hpL * 1.8 + tone) * env * (1 - Math.max(0, pan) * 0.5) * 0.85;
      right[i] = (hpR * 1.8 + tone) * env * (1 - Math.max(0, -pan) * 0.5) * 0.85;
    }
  } else if (preset.id === 'sfx-vine-boom' || preset.id === 'sfx-cinematic-hit') {
    const isImpact = preset.id === 'sfx-cinematic-hit';
    let phase = 0;
    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      const freq = isImpact
        ? 44 + 135 * Math.exp(-t * 28)
        : 39 + 115 * Math.exp(-t * 19);
      phase += (2 * Math.PI * freq) / sampleRate;
      const subEnv = Math.exp(-t * (isImpact ? 2.6 : 2.3)) * Math.min(1, t / 0.004);
      const sub = Math.tanh(Math.sin(phase) * (isImpact ? 1.8 : 2.1)) * subEnv * 0.82;
      const crack = rand() * Math.exp(-t * (isImpact ? 22 : 42)) * (isImpact ? 0.7 : 0.45);
      left[i] = sub + crack;
      right[i] = sub + crack * 0.92;
    }
  } else if (preset.id === 'sfx-glitch-buzz') {
    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      const gate = Math.sin(2 * Math.PI * 28 * t) > -0.25 ? 1 : 0.15;
      const mod = Math.sin(2 * Math.PI * 190 * t) * 420;
      const car = Math.sin(2 * Math.PI * (640 + mod) * t);
      const env = Math.exp(-t * 4.5) * Math.min(1, t / 0.004);
      const s = Math.tanh(car * 1.6) * gate * env * 0.75 + rand() * 0.25 * gate * env;
      left[i] = s;
      right[i] = s * (Math.cos(t * 40) * 0.2 + 0.8);
    }
  } else if (preset.id === 'sfx-cinematic-riser') {
    let phase = 0;
    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      const p = t / duration;
      const freq = 65 * Math.pow(10, p * 1.15);
      phase += (2 * Math.PI * freq) / sampleRate;
      const env = Math.pow(p, 1.65) * (t > duration - 0.06 ? (duration - t) / 0.06 : 1);
      const saw = ((phase / (2 * Math.PI)) % 1) * 2 - 1;
      const air = rand() * Math.pow(p, 2.2) * 0.45;
      left[i] = (saw * 0.55 + Math.sin(phase) * 0.4 + air) * env * 0.78;
      right[i] = (saw * 0.52 + Math.sin(phase * 1.003) * 0.4 + air * 0.95) * env * 0.78;
    }
  } else if (preset.id === 'sfx-camera-shutter') {
    addClickImpulse(0.015, 2900, 0.95, -0.1);
    addClickImpulse(0.055, 1950, 0.75, 0.1);
    addClickImpulse(0.115, 3400, 0.85, 0);
    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      const spring = Math.sin(2 * Math.PI * 460 * t) * Math.exp(-Math.abs(t - 0.12) * 45) * 0.2;
      left[i] += spring;
      right[i] += spring;
    }
  } else if (preset.id === 'sfx-subscribe-bell') {
    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      const env = Math.exp(-t * 4.2) * Math.min(1, t / 0.004);
      const bell =
        Math.sin(2 * Math.PI * 1567.98 * t) * 0.55 +
        Math.sin(2 * Math.PI * 3135.96 * t) * 0.28 +
        Math.sin(2 * Math.PI * 4703.94 * t) * 0.12;
      left[i] = bell * env * 0.85;
      right[i] = bell * env * 0.85;
    }
  } else if (preset.id === 'sfx-coin-cash') {
    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      const b5 = t < 0.1 ? Math.sin(2 * Math.PI * 987.77 * t) * Math.exp(-t * 14) : 0;
      const t2 = Math.max(0, t - 0.095);
      const e6 =
        t >= 0.095
          ? (Math.sin(2 * Math.PI * 1318.51 * t2) * 0.7 +
              Math.sin(2 * Math.PI * 2637.02 * t2) * 0.3) *
            Math.exp(-t2 * 5.2)
          : 0;
      const s = (b5 * 0.65 + e6 * 0.78) * Math.min(1, t / 0.004);
      left[i] = s;
      right[i] = s;
    }
  } else if (preset.id === 'sfx-correct-chime') {
    const notes = [
      { f: 523.25, t0: 0.01 },
      { f: 659.25, t0: 0.09 },
      { f: 783.99, t0: 0.17 },
      { f: 1046.5, t0: 0.26 },
    ];
    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      let sum = 0;
      for (const n of notes) {
        if (t >= n.t0) {
          const lt = t - n.t0;
          sum += Math.sin(2 * Math.PI * n.f * lt) * Math.exp(-lt * 6.5) * Math.min(1, lt / 0.005);
        }
      }
      left[i] = sum * 0.36;
      right[i] = sum * 0.36;
    }
  } else if (preset.id === 'sfx-wrong-buzzer') {
    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      const pulse = t < 0.24 ? 1 : t < 0.29 ? 0.15 : 1;
      const env = Math.exp(-t * 2.8) * Math.min(1, t / 0.008) * pulse;
      const buzz1 = Math.tanh(Math.sin(2 * Math.PI * 138 * t) * 2.5);
      const buzz2 = Math.tanh(Math.sin(2 * Math.PI * 146 * t) * 2.5);
      const s = (buzz1 + buzz2) * 0.34 * env;
      left[i] = s;
      right[i] = s;
    }
  } else if (preset.id === 'sfx-rimshot') {
    // Kick + snare at 0.02, snare at 0.22, crash/hihat sizzle at 0.42
    addClickImpulse(0.02, 220, 0.9, 0);
    addClickImpulse(0.22, 290, 0.85, 0);
    for (let i = Math.floor(0.42 * sampleRate); i < totalSamples; i++) {
      const lt = i / sampleRate - 0.42;
      const env = Math.exp(-lt * 5.2) * Math.min(1, lt / 0.004);
      const metal =
        Math.sin(2 * Math.PI * 3400 * lt) * 0.2 +
        Math.sin(2 * Math.PI * 5240 * lt) * 0.18 +
        rand() * 0.65;
      left[i] += metal * env * 0.65;
      right[i] += metal * env * 0.62;
    }
  } else if (preset.id === 'sfx-sparkle-magic') {
    const freqs = [1046.5, 1174.66, 1318.51, 1567.98, 1760, 2093, 2349.32, 2637.02];
    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      let sum = 0;
      freqs.forEach((f, idx) => {
        const t0 = idx * 0.085;
        if (t >= t0) {
          const lt = t - t0;
          sum += Math.sin(2 * Math.PI * f * lt) * Math.exp(-lt * 5.5) * Math.min(1, lt / 0.005);
        }
      });
      left[i] = sum * 0.28;
      right[i] = sum * 0.28;
    }
  } else if (preset.id === 'sfx-countdown-beep') {
    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      const env = (t < 0.28 ? 1 : Math.exp(-(t - 0.28) * 32)) * Math.min(1, t / 0.006);
      const s = Math.sin(2 * Math.PI * 880 * t) * env * 0.72;
      left[i] = s;
      right[i] = s;
    }
  } else if (preset.id === 'sfx-heartbeat') {
    const addBeat = (t0: number, peakFreq: number, amp: number) => {
      for (let k = 0; k < Math.floor(0.28 * sampleRate); k++) {
        const idx = Math.floor(t0 * sampleRate) + k;
        if (idx >= totalSamples) break;
        const lt = k / sampleRate;
        const f = 38 + peakFreq * Math.exp(-lt * 22);
        const env = Math.exp(-lt * 11) * Math.min(1, lt / 0.012);
        const s = Math.sin(2 * Math.PI * f * lt) * env * amp;
        left[idx] += s;
        right[idx] += s;
      }
    };
    addBeat(0.05, 58, 0.9);
    addBeat(0.28, 48, 0.72);
    addBeat(0.75, 58, 0.85);
    addBeat(0.98, 48, 0.68);
  } else if (preset.id === 'sfx-vinyl-scratch') {
    let phase = 0;
    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      const norm = t / duration;
      const freq = 520 * Math.pow(1 - norm, 2.2) + 45;
      phase += (2 * Math.PI * freq) / sampleRate;
      const env = (1 - norm * 0.85) * Math.min(1, t / 0.008);
      const s = (Math.sin(phase) * 0.65 + Math.sin(phase * 2.02) * 0.28 + rand() * 0.18) * env * 0.8;
      left[i] = s;
      right[i] = s;
    }
  }

  const { blob, url, waveform } = encodeStereoWav(left, right, sampleRate);
  const entry = { blob, url, waveform, duration };
  synthesizedSfxCache.set(presetId, entry);
  return entry;
}

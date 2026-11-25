import { CaptionCue, splitScriptIntoCaptionCues } from './captions';
import {
  detectTextLanguage,
  SUPPORTED_CAPTION_LANGUAGES,
} from './languageSupport';
import { clamp } from './time';
import type {
  WhisperChunk,
  WhisperWorkerRequest,
  WhisperWorkerResponse,
} from '../workers/whisperWorker';

let sharedWorker: Worker | null = null;
let requestCounter = 0;

function getWhisperWorker(): Worker {
  if (!sharedWorker) {
    sharedWorker = new Worker(
      new URL('../workers/whisperWorker.ts', import.meta.url),
      { type: 'module' }
    );
  }
  return sharedWorker;
}

const WHISPER_LANGUAGE_MAP: Record<string, string> = {
  english: 'english',
  urdu: 'urdu',
  hindi: 'hindi',
  hinglish: 'hindi',
  'roman urdu': 'urdu',
  arabic: 'arabic',
  persian: 'persian',
  farsi: 'persian',
  pashto: 'pashto',
  sindhi: 'sindhi',
  punjabi: 'punjabi',
  bengali: 'bengali',
  tamil: 'tamil',
  telugu: 'telugu',
  gujarati: 'gujarati',
  kannada: 'kannada',
  malayalam: 'malayalam',
  marathi: 'marathi',
  nepali: 'nepali',
  spanish: 'spanish',
  french: 'french',
  german: 'german',
  portuguese: 'portuguese',
  italian: 'italian',
  dutch: 'dutch',
  turkish: 'turkish',
  russian: 'russian',
  ukrainian: 'ukrainian',
  polish: 'polish',
  greek: 'greek',
  hebrew: 'hebrew',
  chinese: 'chinese',
  japanese: 'japanese',
  korean: 'korean',
  thai: 'thai',
  vietnamese: 'vietnamese',
  indonesian: 'indonesian',
  malay: 'malay',
  swahili: 'swahili',
};

function resolveWhisperLanguageOption(targetLanguage: string): {
  language?: string;
  task: 'transcribe' | 'translate';
} {
  const lower = targetLanguage.trim().toLowerCase();
  if (!lower || lower === 'auto') {
    return { task: 'transcribe' };
  }
  if (lower === 'english') {
    return { task: 'translate' };
  }
  for (const [key, whisperLang] of Object.entries(WHISPER_LANGUAGE_MAP)) {
    if (lower.includes(key)) {
      return { language: whisperLang, task: 'transcribe' };
    }
  }
  return { task: 'transcribe' };
}

function normalizeWhisperChunksToCues(
  chunks: WhisperChunk[],
  fullText: string,
  audioDuration: number,
  maxWordsPerCue: number
): CaptionCue[] {
  const safeMaxWords = clamp(Math.round(maxWordsPerCue || 7), 2, 16);
  const safeDur = Math.max(0.5, audioDuration);
  const cleanedChunks = chunks
    .map((c) => ({
      text: c.text.replace(/\s+/g, ' ').trim(),
      start: Math.max(0, Number(c.timestamp[0]) || 0),
      end: c.timestamp[1] !== null && Number.isFinite(c.timestamp[1])
        ? Math.max(0, Number(c.timestamp[1]))
        : null,
    }))
    .filter((c) => c.text.length > 0 && !/^\[(?:blank_audio|music|silence|applause|laughter)\]$/i.test(c.text));

  if (cleanedChunks.length === 0) {
    const trimmedFull = fullText.replace(/\s+/g, ' ').trim();
    if (
      !trimmedFull ||
      /^\[(?:blank_audio|music|silence|applause|laughter)\]$/i.test(trimmedFull)
    ) {
      return [];
    }
    const estCueDur = clamp(safeDur / Math.max(1, Math.ceil(trimmedFull.split(/\s+/).length / safeMaxWords)), 0.8, 3.5);
    return splitScriptIntoCaptionCues(trimmedFull, 0, estCueDur, safeMaxWords).map((c) => ({
      ...c,
      endTime: Number(Math.min(safeDur, c.endTime).toFixed(2)),
    }));
  }

  const expanded: CaptionCue[] = [];
  for (let i = 0; i < cleanedChunks.length; i++) {
    const cur = cleanedChunks[i];
    const nextStart = cleanedChunks[i + 1]?.start;
    const rawEnd = cur.end ?? (nextStart && nextStart > cur.start ? nextStart : Math.min(safeDur, cur.start + 3.2));
    const segStart = clamp(cur.start, 0, Math.max(0, safeDur - 0.3));
    const segEnd = clamp(Math.max(segStart + 0.35, rawEnd), segStart + 0.35, safeDur);

    const words = cur.text.split(/\s+/).filter(Boolean);
    if (words.length <= safeMaxWords) {
      expanded.push({
        startTime: Number(segStart.toFixed(2)),
        endTime: Number(segEnd.toFixed(2)),
        text: cur.text,
      });
    } else {
      const partCount = Math.ceil(words.length / safeMaxWords);
      const step = (segEnd - segStart) / partCount;
      for (let p = 0; p < partCount; p++) {
        const piece = words.slice(p * safeMaxWords, (p + 1) * safeMaxWords).join(' ');
        if (!piece) continue;
        expanded.push({
          startTime: Number((segStart + p * step).toFixed(2)),
          endTime: Number(Math.min(safeDur, segStart + (p + 1) * step).toFixed(2)),
          text: piece,
        });
      }
    }
  }

  // Enforce non-overlapping monotonic cue timeline
  const nonOverlapping: CaptionCue[] = [];
  let cursor = 0;
  for (const cue of expanded) {
    const start = Math.max(cue.startTime, cursor);
    if (start >= safeDur - 0.15) break;
    const minDur = Math.min(0.35, safeDur - start);
    const end = clamp(Math.max(start + minDur, cue.endTime), start + minDur, safeDur);
    if (end <= start) continue;
    nonOverlapping.push({
      startTime: Number(start.toFixed(2)),
      endTime: Number(end.toFixed(2)),
      text: cue.text,
    });
    cursor = end;
  }

  return nonOverlapping;
}

export interface OfflineTranscriptionResult {
  cues: CaptionCue[];
  text: string;
  detectedLanguage: string;
  script: string;
  direction: 'ltr' | 'rtl';
}

export async function isOfflineWhisperCached(): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  try {
    const cache = await caches.open('transformers-cache');
    const keys = await cache.keys();
    return keys.some((req) => req.url.includes('whisper-tiny') && req.url.includes('.onnx'));
  } catch {
    return false;
  }
}

export function transcribeAudioOfflineWhisper(
  pcm16k: Float32Array,
  audioDuration: number,
  targetLanguage = 'auto',
  maxWordsPerCue = 7,
  onProgress?: (label: string) => void
): Promise<OfflineTranscriptionResult> {
  return new Promise((resolve, reject) => {
    const worker = getWhisperWorker();
    const id = `whisper-${++requestCounter}`;
    const { language, task } = resolveWhisperLanguageOption(targetLanguage);

    const handleMessage = (event: MessageEvent<WhisperWorkerResponse>) => {
      const data = event.data;
      if (!data || data.id !== id) return;

      if (data.type === 'progress') {
        if (data.status === 'detecting-language') {
          onProgress?.('Auto-detecting spoken language from audio...');
        } else if (data.status === 'transcribing') {
          onProgress?.('Transcribing audio in detected spoken language...');
        } else if (typeof data.progress === 'number') {
          const pct = Math.max(1, Math.min(99, Math.round(data.progress)));
          onProgress?.(`Loading offline Whisper speech model (${pct}%)...`);
        } else {
          onProgress?.('Preparing offline Whisper speech engine...');
        }
        return;
      }

      if (data.type === 'error') {
        cleanup();
        reject(new Error(data.message));
        return;
      }

      if (data.type === 'result') {
        cleanup();
        const cues = normalizeWhisperChunksToCues(
          data.chunks,
          data.text,
          audioDuration,
          maxWordsPerCue
        );
        const joined = cues.map((c) => c.text).join(' ') || data.text.trim();
        const langInfo = detectTextLanguage(joined);
        const codeMatch = data.detectedLanguageCode
          ? SUPPORTED_CAPTION_LANGUAGES.find(
              (l) => l.code.toLowerCase() === data.detectedLanguageCode?.toLowerCase()
            )
          : undefined;
        const resolvedDirection =
          langInfo.direction === 'rtl'
            ? 'rtl'
            : codeMatch?.direction === 'rtl'
            ? 'rtl'
            : langInfo.direction;
        resolve({
          cues,
          text: joined,
          detectedLanguage:
            cues.length === 0
              ? 'No Speech Detected'
              : task === 'translate'
              ? 'English (Whisper)'
              : codeMatch?.name ?? langInfo.languageName,
          script: cues.length === 0 ? 'None' : langInfo.script,
          direction: resolvedDirection,
        });
      }
    };

    const handleError = (err: ErrorEvent) => {
      cleanup();
      reject(new Error(err.message || 'Offline Whisper worker encountered an error.'));
    };

    const cleanup = () => {
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
    };

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);

    // Clone buffer so caller retains original if needed
    const copy = new Float32Array(pcm16k);
    const req: WhisperWorkerRequest = {
      id,
      type: 'transcribe',
      audio: copy,
      language,
      task,
    };
    worker.postMessage(req, [copy.buffer]);
  });
}

export function preloadOfflineWhisper(
  onProgress?: (label: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const worker = getWhisperWorker();
    const id = `whisper-preload-${++requestCounter}`;

    const handleMessage = (event: MessageEvent<WhisperWorkerResponse>) => {
      const data = event.data;
      if (!data || data.id !== id) return;

      if (data.type === 'progress') {
        if (typeof data.progress === 'number') {
          const pct = Math.max(1, Math.min(99, Math.round(data.progress)));
          onProgress?.(`Downloading offline Whisper speech model (${pct}%)...`);
        } else {
          onProgress?.('Preparing offline Whisper speech model...');
        }
        return;
      }

      if (data.type === 'error') {
        cleanup();
        reject(new Error(data.message));
        return;
      }

      if (data.type === 'ready') {
        cleanup();
        resolve();
      }
    };

    const handleError = (err: ErrorEvent) => {
      cleanup();
      reject(new Error(err.message || 'Failed to preload offline speech model.'));
    };

    const cleanup = () => {
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
    };

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);

    worker.postMessage({ id, type: 'preload' } satisfies WhisperWorkerRequest);
  });
}

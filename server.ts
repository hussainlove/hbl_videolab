import 'dotenv/config';
import express, { Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile, execFileSync } from 'child_process';
import { promisify } from 'util';
import multer from 'multer';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const MAX_UPLOAD_BYTES = 250 * 1024 * 1024; // 250 MB

function resolveBinary(name: 'ffmpeg' | 'ffprobe'): string | null {
  const candidates = [`/usr/bin/${name}`, `/usr/local/bin/${name}`, `/bin/${name}`];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  try {
    const found = execFileSync('which', [name], { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
    if (found && fs.existsSync(found)) {
      return found;
    }
  } catch {
    // binary not on PATH
  }
  return null;
}

const resolvedFfmpegPath = resolveBinary('ffmpeg');
const resolvedFfprobePath = resolveBinary('ffprobe');

const ALLOWED_AUDIO_MIME_TYPES = new Set([
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/m4a',
  'audio/aac',
  'audio/ogg',
  'audio/webm',
  'audio/flac',
]);

function sanitizeAudioMimeType(rawMime: unknown): string {
  if (typeof rawMime !== 'string') return 'audio/wav';
  const normalized = rawMime.split(';')[0].trim().toLowerCase();
  return ALLOWED_AUDIO_MIME_TYPES.has(normalized) ? normalized : 'audio/wav';
}

function createGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please add your API key in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function extractUpstreamErrorMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string; code?: number; status?: string } };
    if (parsed?.error?.message) {
      return parsed.error.message;
    }
  } catch {
    const jsonStart = raw.indexOf('{');
    if (jsonStart !== -1) {
      try {
        const parsed = JSON.parse(raw.slice(jsonStart)) as { error?: { message?: string } };
        if (parsed?.error?.message) return parsed.error.message;
      } catch {
        // ignore nested JSON parse failure
      }
    }
  }
  return raw;
}

function isRetryableGeminiError(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  return (
    lower.includes('503') ||
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('429') ||
    lower.includes('resource_exhausted') ||
    lower.includes('deadline_exceeded') ||
    lower.includes('econnreset') ||
    lower.includes('fetch failed') ||
    lower.includes('500')
  );
}

function isModelUnavailableError(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  return (
    lower.includes('404') ||
    lower.includes('not_found') ||
    lower.includes('not found') ||
    lower.includes('is not supported') ||
    lower.includes('does not support')
  );
}

const TEXT_FALLBACK_MODELS = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'] as const;

async function generateWithFallback(
  ai: GoogleGenAI,
  models: readonly string[],
  buildParams: (model: string) => Parameters<GoogleGenAI['models']['generateContent']>[0]
) {
  let lastError: unknown;
  const attemptErrors: string[] = [];
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await ai.models.generateContent(buildParams(model));
      } catch (err) {
        lastError = err;
        const msg = extractUpstreamErrorMessage(err instanceof Error ? err.message : String(err));
        attemptErrors.push(`${model}#${attempt + 1}: ${msg}`);
        console.error(`[Caption API] ${model} attempt ${attempt + 1} failed:`, msg);
        if (isModelUnavailableError(err)) {
          break; // Immediately try next model
        }
        if (isRetryableGeminiError(err) && attempt === 0) {
          await new Promise((r) => setTimeout(r, 700));
          continue;
        }
        if (isRetryableGeminiError(err)) {
          break; // Move to fallback model after retry
        }
        throw err;
      }
    }
  }
  if (lastError instanceof Error && attemptErrors.length > 0) {
    (lastError as Error & { attemptErrors?: string[] }).attemptErrors = attemptErrors;
  }
  throw lastError;
}

function formatApiError(err: unknown): { status: number; message: string; details?: string[] } {
  const raw = err instanceof Error ? err.message : String(err);
  const cleanMsg = extractUpstreamErrorMessage(raw);
  const lower = raw.toLowerCase();
  const details =
    err instanceof Error && Array.isArray((err as Error & { attemptErrors?: string[] }).attemptErrors)
      ? (err as Error & { attemptErrors?: string[] }).attemptErrors
      : undefined;

  if (raw.includes('GEMINI_API_KEY')) {
    return { status: 400, message: cleanMsg, details };
  }
  if (lower.includes('api_key_invalid') || lower.includes('permission_denied') || lower.includes('403')) {
    return {
      status: 403,
      message: 'Gemini API key permission denied or invalid. Check Settings > Secrets.',
      details,
    };
  }
  if (lower.includes('not_found') || lower.includes('404')) {
    return {
      status: 404,
      message: `Caption AI model unavailable (${cleanMsg}). Please retry or use Offline Sync.`,
      details,
    };
  }
  if (lower.includes('503') || lower.includes('unavailable') || lower.includes('high demand')) {
    return {
      status: 503,
      message:
        'Caption AI servers are temporarily busy (high demand). Please retry in a few seconds, or use Offline Sync / Script Captions.',
      details,
    };
  }
  if (lower.includes('resource_exhausted') || lower.includes('429')) {
    return {
      status: 429,
      message: 'Rate limit or quota reached on Gemini API. Please retry shortly.',
      details,
    };
  }
  return { status: 500, message: cleanMsg || 'Unexpected server error.', details };
}

function stripJsonCodeFences(rawText: string): string {
  const trimmed = rawText.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

interface CuePayload {
  startTime: number;
  endTime: number;
  text: string;
}

function clampNum(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function normalizeSequentialCues(
  rawCues: unknown,
  maxDuration: number,
  fallbackStepSec = 2.2
): CuePayload[] {
  if (!Array.isArray(rawCues)) return [];

  const preliminary = rawCues
    .filter((c): c is CuePayload => Boolean(c && typeof (c as CuePayload).text === 'string' && (c as CuePayload).text.trim().length > 0))
    .map((c, idx) => {
      const rawStart = Number.isFinite(Number(c.startTime))
        ? Number(c.startTime)
        : idx * fallbackStepSec;
      const start = clampNum(rawStart, 0, Math.max(0, maxDuration - 0.35));
      const rawEnd = Number.isFinite(Number(c.endTime))
        ? Number(c.endTime)
        : start + fallbackStepSec;
      const end = clampNum(rawEnd, start + 0.35, maxDuration);
      return {
        startTime: Number(start.toFixed(2)),
        endTime: Number(end.toFixed(2)),
        text: c.text.trim(),
      };
    })
    .sort((a, b) => a.startTime - b.startTime);

  const normalized: CuePayload[] = [];
  let prevEnd = 0;

  for (const cue of preliminary) {
    let start = Math.max(cue.startTime, prevEnd);
    if (start >= maxDuration - 0.2) break;
    const minDuration = Math.min(0.35, maxDuration - start);
    const desiredDur = Math.max(cue.endTime - cue.startTime, minDuration);
    const end = clampNum(start + desiredDur, start + minDuration, maxDuration);
    start = Number(start.toFixed(2));
    const roundedEnd = Number(end.toFixed(2));
    if (roundedEnd <= start) continue;
    normalized.push({
      startTime: start,
      endTime: roundedEnd,
      text: cue.text,
    });
    prevEnd = roundedEnd;
  }

  return normalized;
}

const uploadStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const jobDir = path.join(os.tmpdir(), `framecut-cap-${crypto.randomUUID()}`);
    fs.mkdirSync(jobDir, { recursive: true });
    (req as Request & { captionJobDir?: string }).captionJobDir = jobDir;
    cb(null, jobDir);
  },
  filename: (_req, _file, cb) => {
    // Never use user-controlled filenames in disk paths
    cb(null, 'input.media');
  },
});

const ALLOWED_MEDIA_EXTENSIONS = new Set([
  '.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi', '.flv', '.ts', '.mts', '.m2ts', '.wmv', '.3gp', '.ogv', '.mpeg', '.mpg',
  '.mp3', '.wav', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.flac', '.wma', '.amr', '.aiff', '.aif', '.caf',
]);

const uploadMedia = multer({
  storage: uploadStorage,
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const mime = (file.mimetype || '').toLowerCase();
    const ext = path.extname(file.originalname || '').toLowerCase();
    const isMediaMime =
      mime.startsWith('video/') ||
      mime.startsWith('audio/') ||
      mime === 'application/ogg' ||
      mime === 'application/x-matroska' ||
      mime === 'application/octet-stream' ||
      mime === '';
    if (!isMediaMime && !ALLOWED_MEDIA_EXTENSIONS.has(ext)) {
      cb(new Error('Unsupported file type. Upload a valid audio or video file.'));
      return;
    }
    cb(null, true);
  },
});

async function runFfmpegAudioExtract(
  inputPath: string,
  outputPath: string,
  startOffset: number,
  duration: number | null
): Promise<void> {
  if (!resolvedFfmpegPath) {
    throw new Error('FFmpeg binary is unavailable on the server.');
  }
  const args: string[] = ['-y'];
  if (startOffset > 0) {
    args.push('-ss', String(startOffset));
  }
  args.push('-i', inputPath);
  if (duration !== null && duration > 0) {
    args.push('-t', String(duration));
  }
  args.push(
    '-vn',
    '-ac',
    '1',
    '-ar',
    '16000',
    '-c:a',
    'libmp3lame',
    '-b:a',
    '64k',
    '-af',
    'highpass=f=80,dynaudnorm=f=150:g=15',
    '-f',
    'mp3',
    outputPath
  );
  try {
    await execFileAsync(resolvedFfmpegPath, args, { maxBuffer: 10 * 1024 * 1024 });
  } catch (err) {
    const e = err as Error & { stderr?: string };
    const detail = e.stderr?.trim() || e.message || 'FFmpeg execution failed.';
    throw new Error(detail);
  }
}

async function getMediaDurationSec(filePath: string): Promise<number | null> {
  if (!resolvedFfprobePath) return null;
  try {
    const { stdout } = await execFileAsync(resolvedFfprobePath, [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    const dur = Number(stdout.trim());
    return Number.isFinite(dur) && dur > 0 ? Number(dur.toFixed(2)) : null;
  } catch {
    return null;
  }
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  app.use(express.json({ limit: '35mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, ffmpegReady: Boolean(resolvedFfmpegPath) });
  });

  // Extract & normalize speech audio from uploaded video/audio containers via FFmpeg
  app.post('/api/captions/extract-audio', (req: Request, res: Response) => {
    uploadMedia.single('media')(req, res, async (uploadErr: unknown) => {
      const reqWithDir = req as Request & { captionJobDir?: string };
      const jobDir = reqWithDir.captionJobDir;

      const cleanupJobDir = async () => {
        if (jobDir) {
          await fs.promises.rm(jobDir, { recursive: true, force: true }).catch(() => {});
        }
      };

      if (uploadErr) {
        await cleanupJobDir();
        const msg =
          uploadErr instanceof multer.MulterError && uploadErr.code === 'LIMIT_FILE_SIZE'
            ? 'Uploaded media exceeds the 250 MB caption extraction limit.'
            : uploadErr instanceof Error
            ? uploadErr.message
            : 'Media upload failed.';
        res.status(400).json({ error: msg });
        return;
      }

      if (!req.file) {
        await cleanupJobDir();
        res.status(400).json({ error: 'Missing media file for FFmpeg audio extraction.' });
        return;
      }

      if (!resolvedFfmpegPath) {
        await cleanupJobDir();
        res.status(503).json({ error: 'FFmpeg binary is unavailable on the server.' });
        return;
      }

      try {
        const startOffset = clampNum(Number(req.body?.startOffset) || 0, 0, 86400);
        const requestedDurRaw = Number(req.body?.duration);
        const requestedDuration =
          Number.isFinite(requestedDurRaw) && requestedDurRaw > 0
            ? clampNum(requestedDurRaw, 0.5, 900)
            : 900;

        const inputPath = req.file.path;
        const outputPath = path.join(path.dirname(inputPath), 'normalized.mp3');

        await runFfmpegAudioExtract(inputPath, outputPath, startOffset, requestedDuration);

        const audioBuf = await fs.promises.readFile(outputPath);
        if (audioBuf.length === 0) {
          res.status(422).json({ error: 'Selected media file does not contain an audible stream.' });
          return;
        }

        const probedDuration = (await getMediaDurationSec(outputPath)) ?? requestedDuration;

        res.json({
          audioBase64: audioBuf.toString('base64'),
          mimeType: 'audio/mpeg',
          duration: Number(clampNum(probedDuration, 0.5, 900).toFixed(2)),
        });
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err);
        const lower = raw.toLowerCase();
        if (
          lower.includes('does not contain any stream') ||
          lower.includes('matches no streams') ||
          lower.includes('no audio')
        ) {
          res.status(422).json({ error: 'Selected media file has no audio stream.' });
          return;
        }
        res.status(500).json({ error: raw || 'FFmpeg failed to extract audio from media.' });
      } finally {
        await cleanupJobDir();
      }
    });
  });

  // Auto-detect spoken language in audio + transcribe into timed captions in ANY language
  app.post('/api/captions/auto-detect', async (req: Request, res: Response) => {
    try {
      const { audioBase64, mimeType, duration, targetLanguage, maxWordsPerCue } = req.body as {
        audioBase64?: string;
        mimeType?: string;
        duration?: number;
        targetLanguage?: string;
        maxWordsPerCue?: number;
      };

      if (!audioBase64 || typeof audioBase64 !== 'string') {
        res.status(400).json({ error: 'Missing audio data for caption detection.' });
        return;
      }

      const safeMime = sanitizeAudioMimeType(mimeType);
      const safeDuration = clampNum(Number(duration) || 10, 1, 3600);
      const safeMaxWords = clampNum(Math.round(Number(maxWordsPerCue) || 7), 2, 16);
      const targetLang = typeof targetLanguage === 'string' ? targetLanguage.trim() : 'auto';
      const keepOriginal = !targetLang || targetLang.toLowerCase() === 'auto';

      const ai = createGeminiClient();

      const captionResponseSchema = {
        type: Type.OBJECT,
        properties: {
          detectedLanguage: {
            type: Type.STRING,
            description: 'Human-readable name of the original detected spoken language.',
          },
          languageCode: {
            type: Type.STRING,
            description: 'ISO 639-1 / BCP-47 code of the output caption language (e.g. ur, en, hi, ar, es).',
          },
          script: {
            type: Type.STRING,
            description: 'Primary writing script name of the output captions (e.g. Arabic/Nastaliq, Latin, Devanagari, Han).',
          },
          direction: {
            type: Type.STRING,
            description: 'Text direction of the output captions: either "rtl" or "ltr".',
          },
          cues: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                startTime: { type: Type.NUMBER },
                endTime: { type: Type.NUMBER },
                text: { type: Type.STRING },
              },
            },
          },
        },
      };

      const isHinglishTarget =
        targetLang.toLowerCase().includes('hinglish') ||
        targetLang.toLowerCase().includes('roman urdu');
      const languageInstruction = keepOriginal
        ? 'CRITICAL: Keep every caption in the EXACT same language and native writing script spoken in the audio (e.g., Urdu in اردو script, Hindi in हिन्दी Devanagari, Arabic in العربية, Punjabi in شاہ مکھی/گورمکھی or Gurmukhi, Persian in فارسی, English in English, Spanish in Español, etc.). NEVER translate non-English spoken speech into English.'
        : isHinglishTarget
        ? `Translate or transliterate the captions naturally into ${targetLang} using conversational Romanized Hindi/Urdu in Latin alphabet (LTR), e.g. "Aaj hum video edit kar rahe hain".`
        : `Translate the captions accurately into ${targetLang} using its natural native writing script.`;

      const captionSystemInstruction =
        'You are a universal multilingual video captioning engine supporting every world language and writing script (Urdu Nastaliq/Arabic RTL, Hindi Devanagari, Hinglish / Roman Urdu in Latin script, Arabic RTL, Persian RTL, Pashto RTL, Punjabi, Bengali, CJK, Hangul, Cyrillic, Hebrew RTL, Thai, Tamil, Spanish, French, Turkish, English, etc.). ' +
        'Listen directly to the audio first to identify the EXACT spoken language. When target language is Auto, NEVER translate spoken speech into English—always transcribe verbatim in the speaker\'s exact spoken language and native script. Set direction ("rtl" for Arabic-script Urdu, Arabic, Persian, Pashto, Sindhi, Hebrew; "ltr" for Hinglish, Roman Urdu, English, Hindi Devanagari, and all other LTR scripts), and produce cleanly timed subtitle cues spanning 0 to audio duration without overlapping. If there is no audible speech (only silence, background hum, or instrumental music), return cues: [] and detectedLanguage: "No Speech Detected".';

      // Step 1: Try dedicated transcription model first; seamlessly fall back to multimodal Gemini on any Step 1 failure
      let rawTranscript = '';
      let usedTwoStep = false;
      try {
        const transcribePrompt = keepOriginal
          ? 'Listen carefully to this audio and transcribe all spoken dialogue verbatim in the EXACT language and native script spoken by the speaker (Urdu -> اردو, Hindi -> हिन्दी, Arabic -> العربية, Persian -> فارسی, Punjabi -> ਪੰਜਾਬੀ/پنجابی, English -> English, Spanish -> Español, etc.). CRITICAL: NEVER translate spoken speech into English. Include [MM:SS] timestamps at natural phrase boundaries. If the audio contains only silence, noise, or music with no actual speech, reply strictly with NO_SPEECH.'
          : 'Transcribe all spoken dialogue in this audio verbatim in its exact original spoken language and native writing script (supporting Urdu, Hindi, Hinglish, Arabic, Persian, Punjabi, Bengali, Spanish, French, German, Turkish, Chinese, Japanese, Korean, English, etc.). Include [MM:SS] timestamps at natural phrase boundaries. If the audio contains only music/silence with no speech, reply strictly with NO_SPEECH.';

        const transcriptionRes = await generateWithFallback(
          ai,
          ['gemini-3.5-transcribe'],
          (model) => ({
            model,
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType: safeMime,
                    data: audioBase64,
                  },
                },
                {
                  text: transcribePrompt,
                },
              ],
            },
          })
        );
        rawTranscript = (transcriptionRes.text ?? '').trim();
        usedTwoStep = Boolean(rawTranscript);
      } catch (transcribeErr) {
        const msg = (transcribeErr instanceof Error ? transcribeErr.message : String(transcribeErr)).toLowerCase();
        if (msg.includes('api_key') || msg.includes('permission_denied') || msg.includes('403')) {
          throw transcribeErr;
        }
        // Otherwise seamlessly fall back to multimodal Gemini with the audio directly
        usedTwoStep = false;
      }

      if (usedTwoStep && (!rawTranscript || rawTranscript === 'NO_SPEECH')) {
        res.json({
          detectedLanguage: 'No Speech Detected',
          languageCode: 'und',
          script: 'None',
          direction: 'ltr',
          transcript: '',
          cues: [],
        });
        return;
      }

      // Step 2 (always multimodal with audio so Step 2 directly hears the spoken language & prevents wrong-language/silence hallucinations)
      try {
        const structPrompt =
          usedTwoStep && rawTranscript
            ? `Audio duration: ${safeDuration.toFixed(2)} seconds.\n` +
              `Max words per caption cue: ${safeMaxWords}.\n` +
              `${languageInstruction}\n` +
              `Verify the draft ASR transcript below directly against the attached audio. If the draft translated or mis-wrote the spoken language, transcribe directly from the audio in the exact spoken language/script. If the audio is actually silent/music-only with no real speech, return cues: [].\n\nDraft transcript:\n${rawTranscript}`
            : `Listen carefully to this ${safeDuration.toFixed(2)}-second audio track and transcribe every spoken phrase with accurate startTime/endTime timestamps.\n` +
              `Max words per caption cue: ${safeMaxWords}.\n` +
              `${languageInstruction}`;

        const structRes = await generateWithFallback(ai, TEXT_FALLBACK_MODELS, (model) => ({
          model,
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: safeMime,
                  data: audioBase64,
                },
              },
              {
                text: structPrompt,
              },
            ],
          },
          config: {
            ...(model === 'gemini-4-hydrogen'
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : {}),
            systemInstruction: captionSystemInstruction,
            responseMimeType: 'application/json',
            responseSchema: captionResponseSchema,
          },
        }));

        const parsed = JSON.parse(stripJsonCodeFences(structRes.text ?? '{}')) as {
          detectedLanguage?: string;
          languageCode?: string;
          script?: string;
          direction?: string;
          cues?: CuePayload[];
        };

        const cleanCues = normalizeSequentialCues(parsed.cues, safeDuration);
        const joinedText = cleanCues.map((c) => c.text).join(' ');
        const hasRtlChars = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(
          joinedText
        );
        const resolvedDirection: 'ltr' | 'rtl' =
          cleanCues.length === 0
            ? 'ltr'
            : hasRtlChars
            ? 'rtl'
            : parsed.direction === 'rtl'
            ? 'rtl'
            : 'ltr';

        res.json({
          detectedLanguage:
            parsed.detectedLanguage ||
            (cleanCues.length === 0 ? 'No Speech Detected' : 'Detected Speech'),
          languageCode: parsed.languageCode || 'und',
          script:
            parsed.script ||
            (cleanCues.length === 0 ? 'None' : hasRtlChars ? 'Arabic / RTL' : 'Unicode'),
          direction: resolvedDirection,
          transcript: joinedText || rawTranscript,
          cues: cleanCues,
        });
      } catch (step2Err) {
        if (usedTwoStep && rawTranscript && keepOriginal) {
          // Step 1 (gemini-3.5-transcribe) succeeded! Parse timestamps/phrases cleanly without failing.
          const lines = rawTranscript
            .split(/\n+/)
            .map((l) => l.trim())
            .filter(Boolean);
          const timedRaw: CuePayload[] = [];
          const tsRegex = /^\[?(\d{1,2}):(\d{2})(?:\.(\d+))?\]?\s*(.+)$/;
          for (const line of lines) {
            const m = line.match(tsRegex);
            if (m) {
              const sec = Number(m[1]) * 60 + Number(m[2]) + (m[3] ? Number(`0.${m[3]}`) : 0);
              timedRaw.push({ startTime: sec, endTime: sec + 2.5, text: m[4].trim() });
            } else {
              const words = line.split(/\s+/).filter(Boolean);
              for (let i = 0; i < words.length; i += safeMaxWords) {
                timedRaw.push({
                  startTime: NaN,
                  endTime: NaN,
                  text: words.slice(i, i + safeMaxWords).join(' '),
                });
              }
            }
          }
          const step = safeDuration / Math.max(1, timedRaw.length);
          const filled = timedRaw.map((c, idx) => ({
            startTime: Number.isFinite(c.startTime) ? c.startTime : idx * step,
            endTime: Number.isFinite(c.endTime) ? c.endTime : (idx + 1) * step,
            text: c.text,
          }));
          const cleanCues = normalizeSequentialCues(filled, safeDuration, step);
          const isRtl = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(
            rawTranscript
          );
          res.json({
            detectedLanguage: 'Detected Speech',
            languageCode: 'und',
            script: isRtl ? 'Arabic / RTL' : 'Unicode',
            direction: isRtl ? 'rtl' : 'ltr',
            transcript: rawTranscript,
            cues: cleanCues,
          });
          return;
        }
        throw step2Err;
      }
    } catch (err) {
      const info = formatApiError(err);
      res.status(info.status).json({ error: info.message, details: info.details });
    }
  });

  // Auto-detect text/subtitle language and translate captions into any target language
  app.post('/api/captions/translate', async (req: Request, res: Response) => {
    try {
      const { cues, text, targetLanguage, secondsPerCue, maxWordsPerCue } = req.body as {
        cues?: Array<{ startTime?: number; endTime?: number; text: string }>;
        text?: string;
        targetLanguage?: string;
        secondsPerCue?: number;
        maxWordsPerCue?: number;
      };

      const cleanInputCues = Array.isArray(cues)
        ? cues.filter((c) => c && typeof c.text === 'string' && c.text.trim().length > 0)
        : [];
      const cleanText = typeof text === 'string' ? text.trim() : '';

      if (cleanInputCues.length === 0 && !cleanText) {
        res.status(400).json({ error: 'Provide caption text or cues to detect/translate.' });
        return;
      }

      const targetLang = typeof targetLanguage === 'string' ? targetLanguage.trim() : 'auto';
      const safeCueSec = clampNum(Number(secondsPerCue) || 2.2, 0.6, 15);
      const safeMaxWords = clampNum(Math.round(Number(maxWordsPerCue) || 7), 2, 16);

      const ai = createGeminiClient();

      const isHinglishTarget =
        targetLang.toLowerCase().includes('hinglish') ||
        targetLang.toLowerCase().includes('roman urdu');
      const targetDirective =
        targetLang === 'auto'
          ? 'Auto-detect & preserve original language (including Hinglish / Roman Urdu if written in Roman script)'
          : isHinglishTarget
          ? `${targetLang} (natural conversational Romanized Hindi/Urdu in Latin script, LTR)`
          : targetLang;

      const promptContent =
        cleanInputCues.length > 0
          ? `Target language: ${targetDirective}.\nTranslate/preserve these timed subtitle cues accurately without changing their timing:\n${JSON.stringify(cleanInputCues)}`
          : `Target language: ${targetDirective}.\nSeconds per cue: ${safeCueSec}, max words per cue: ${safeMaxWords}.\nSplit this script into natural timed caption cues starting at 0s and ${targetLang === 'auto' ? 'keep its original language' : `translate into ${targetDirective}`}:\n\n${cleanText}`;

      const response = await generateWithFallback(ai, TEXT_FALLBACK_MODELS, (model) => ({
        model,
        contents: promptContent,
        config: {
          ...(model === 'gemini-4-hydrogen'
            ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
            : {}),
          systemInstruction:
            'You are a multilingual subtitle detection and translation engine supporting every language on Earth, including Hinglish (Romanized Hindi/Urdu in Latin script) and Roman Urdu. ' +
            'Detect the source language accurately (recognizing Hinglish / Roman Urdu cleanly), translate or segment captions into natural short subtitle phrases in the target language script, and set direction to "rtl" ONLY for RTL scripts (Arabic-script Urdu, Arabic, Persian, Pashto, Sindhi, Hebrew) or "ltr" for Hinglish, Roman Urdu, and all LTR scripts.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              detectedLanguage: { type: Type.STRING },
              outputLanguage: { type: Type.STRING },
              languageCode: { type: Type.STRING },
              script: { type: Type.STRING },
              direction: { type: Type.STRING },
              cues: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    startTime: { type: Type.NUMBER },
                    endTime: { type: Type.NUMBER },
                    text: { type: Type.STRING },
                  },
                },
              },
            },
          },
        },
      }));

      const parsed = JSON.parse(stripJsonCodeFences(response.text ?? '{}')) as {
        detectedLanguage?: string;
        outputLanguage?: string;
        languageCode?: string;
        script?: string;
        direction?: string;
        cues?: CuePayload[];
      };

      const maxTimelineLimit = 36000;
      const formattedCues = normalizeSequentialCues(parsed.cues, maxTimelineLimit, safeCueSec);

      res.json({
        detectedLanguage: parsed.detectedLanguage || 'Auto-Detected',
        outputLanguage: parsed.outputLanguage || parsed.detectedLanguage || 'Auto',
        languageCode: parsed.languageCode || 'und',
        script: parsed.script || 'Unicode',
        direction: parsed.direction === 'rtl' ? 'rtl' : 'ltr',
        cues: formattedCues,
      });
    } catch (err) {
      const info = formatApiError(err);
      res.status(info.status).json({ error: info.message, details: info.details });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer },
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req: Request, res: Response) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Framecut server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();

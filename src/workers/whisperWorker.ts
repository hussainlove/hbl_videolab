import {
  env,
  pipeline,
  Tensor,
  type AutomaticSpeechRecognitionPipeline,
} from '@huggingface/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;
env.useWasmCache = true;

const WHISPER_MODEL_ID = 'onnx-community/whisper-tiny';

let transcriberPromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

export interface WhisperWorkerRequest {
  id: string;
  type: 'preload' | 'transcribe';
  audio?: Float32Array;
  language?: string;
  task?: 'transcribe' | 'translate';
}

export interface WhisperChunk {
  text: string;
  timestamp: [number, number | null];
}

export type WhisperWorkerResponse =
  | {
      id: string;
      type: 'progress';
      status: string;
      file?: string;
      progress?: number;
    }
  | {
      id: string;
      type: 'ready';
    }
  | {
      id: string;
      type: 'result';
      text: string;
      chunks: WhisperChunk[];
      detectedLanguageCode?: string;
    }
  | {
      id: string;
      type: 'error';
      message: string;
    };

function pickLoudestSpeechWindow(audio: Float32Array, sampleRate = 16000): Float32Array {
  const maxSamples = sampleRate * 30;
  if (audio.length <= maxSamples) return audio;

  const step = sampleRate * 2;
  let bestOffset = 0;
  let bestEnergy = -1;
  for (let offset = 0; offset + maxSamples <= audio.length; offset += step) {
    let energy = 0;
    for (let i = offset; i < offset + maxSamples; i += 64) {
      const s = audio[i];
      energy += s * s;
    }
    if (energy > bestEnergy) {
      bestEnergy = energy;
      bestOffset = offset;
    }
  }
  return audio.subarray(bestOffset, bestOffset + maxSamples);
}

async function detectWhisperLanguageCode(
  transcriber: AutomaticSpeechRecognitionPipeline,
  audio: Float32Array
): Promise<string | undefined> {
  try {
    const model = transcriber.model as unknown as {
      generation_config?: {
        is_multilingual?: boolean;
        decoder_start_token_id?: number;
        lang_to_id?: Record<string, number>;
      };
      forward?: (inputs: Record<string, unknown>) => Promise<{
        logits?: { data?: Float32Array | number[]; dims?: number[] };
      }>;
    };
    const processor = transcriber.processor as unknown as (
      audioInput: Float32Array
    ) => Promise<{ input_features?: unknown }>;

    const genCfg = model?.generation_config;
    if (!genCfg?.is_multilingual || !genCfg.lang_to_id || typeof model.forward !== 'function') {
      return undefined;
    }

    const startId = genCfg.decoder_start_token_id ?? 50258;
    const windowAudio = pickLoudestSpeechWindow(audio);
    const { input_features } = await processor(windowAudio);
    if (!input_features) return undefined;

    const decoderInputIds = new Tensor('int64', new BigInt64Array([BigInt(startId)]), [1, 1]);
    const outputs = await model.forward({
      input_features,
      decoder_input_ids: decoderInputIds,
    });

    const logits = outputs?.logits;
    if (!logits?.data || !logits.dims || logits.dims.length < 3) return undefined;

    const vocabSize = logits.dims[2];
    const lastOffset = (logits.dims[1] - 1) * vocabSize;
    let bestCode: string | undefined;
    let bestScore = -Infinity;

    for (const [token, tokenId] of Object.entries(genCfg.lang_to_id)) {
      if (typeof tokenId !== 'number' || tokenId < 0 || tokenId >= vocabSize) continue;
      const score = Number(logits.data[lastOffset + tokenId]);
      if (Number.isFinite(score) && score > bestScore) {
        bestScore = score;
        bestCode = token.replace(/^<\|/, '').replace(/\|>$/, '');
      }
    }
    return bestCode;
  } catch {
    return undefined;
  }
}

async function getTranscriber(requestId: string): Promise<AutomaticSpeechRecognitionPipeline> {
  if (!transcriberPromise) {
    transcriberPromise = pipeline('automatic-speech-recognition', WHISPER_MODEL_ID, {
      device: 'wasm',
      dtype: {
        encoder_model: 'q8',
        decoder_model_merged: 'q8',
      },
      progress_callback: (info: {
        status?: string;
        file?: string;
        progress?: number;
      }) => {
        const msg: WhisperWorkerResponse = {
          id: requestId,
          type: 'progress',
          status: info.status || 'loading',
          file: info.file,
          progress: typeof info.progress === 'number' ? info.progress : undefined,
        };
        self.postMessage(msg);
      },
    }).catch((err) => {
      transcriberPromise = null;
      throw err;
    });
  }
  return transcriberPromise;
}

self.addEventListener('message', async (event: MessageEvent<WhisperWorkerRequest>) => {
  const { id, type, audio, language, task } = event.data;

  try {
    const transcriber = await getTranscriber(id);

    if (type === 'preload') {
      self.postMessage({ id, type: 'ready' } satisfies WhisperWorkerResponse);
      return;
    }

    if (!audio || audio.length === 0) {
      throw new Error('No audio waveform provided for offline speech transcription.');
    }

    let resolvedLanguage = language;
    if (!resolvedLanguage) {
      self.postMessage({
        id,
        type: 'progress',
        status: 'detecting-language',
        progress: 96,
      } satisfies WhisperWorkerResponse);
      resolvedLanguage = await detectWhisperLanguageCode(transcriber, audio);
    }

    self.postMessage({
      id,
      type: 'progress',
      status: 'transcribing',
      progress: 100,
    } satisfies WhisperWorkerResponse);

    const result = await transcriber(audio, {
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
      ...(resolvedLanguage ? { language: resolvedLanguage } : {}),
      ...(task ? { task } : {}),
    });

    const single = Array.isArray(result) ? result[0] : result;
    const chunks: WhisperChunk[] = Array.isArray(single?.chunks)
      ? single.chunks.map((c: { text?: unknown; timestamp?: unknown }) => ({
          text: typeof c.text === 'string' ? c.text : '',
          timestamp: Array.isArray(c.timestamp)
            ? [Number(c.timestamp[0]) || 0, c.timestamp[1] === null ? null : Number(c.timestamp[1]) || 0]
            : [0, null],
        }))
      : [];

    self.postMessage({
      id,
      type: 'result',
      text: typeof single?.text === 'string' ? single.text : '',
      chunks,
      detectedLanguageCode: resolvedLanguage,
    } satisfies WhisperWorkerResponse);
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    const offlineHint =
      typeof navigator !== 'undefined' && !navigator.onLine
        ? 'Offline speech model is not downloaded yet. Connect once and run Auto-Detect Captions to cache Whisper (~40MB) for full offline use.'
        : rawMsg;

    self.postMessage({
      id,
      type: 'error',
      message: offlineHint || 'Offline speech transcription failed.',
    } satisfies WhisperWorkerResponse);
  }
});

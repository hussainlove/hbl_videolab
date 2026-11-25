import {
  CAPTION_STYLE_PRESETS,
  CaptionPositionPreset,
  CaptionStylePreset,
  isTitleTrack,
  TextConfig,
  TimelineClip,
} from '../types/editor';
import { clamp } from './time';

export interface CaptionCue {
  startTime: number;
  endTime: number;
  text: string;
}

function parseTimestampToSeconds(raw: string): number {
  const cleaned = raw.trim().replace(',', '.');
  const parts = cleaned.split(':');
  if (parts.length === 3) {
    const h = parseFloat(parts[0]) || 0;
    const m = parseFloat(parts[1]) || 0;
    const s = parseFloat(parts[2]) || 0;
    return Math.max(0, h * 3600 + m * 60 + s);
  }
  if (parts.length === 2) {
    const m = parseFloat(parts[0]) || 0;
    const s = parseFloat(parts[1]) || 0;
    return Math.max(0, m * 60 + s);
  }
  return Math.max(0, parseFloat(cleaned) || 0);
}

function formatSubtitleTimestamp(sec: number, separator: ',' | '.'): string {
  const safe = Math.max(0, sec);
  const hours = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const ms = Math.round((safe - Math.floor(safe)) * 1000);
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const pad3 = (n: number) => String(clamp(n, 0, 999)).padStart(3, '0');
  return `${pad2(hours)}:${pad2(mins)}:${pad2(secs)}${separator}${pad3(ms)}`;
}

export function parseSrtOrVtt(content: string): CaptionCue[] {
  const normalized = content
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  if (!normalized) return [];

  // ASS / SSA Dialogue lines support
  if (/^\[Script Info\]/im.test(normalized) || /^Dialogue:\s*\d+,/im.test(normalized)) {
    const assCues: CaptionCue[] = [];
    for (const rawLine of normalized.split('\n')) {
      const line = rawLine.trim();
      if (!line.startsWith('Dialogue:')) continue;
      const body = line.slice('Dialogue:'.length).trim();
      const parts = body.split(',');
      if (parts.length < 10) continue;
      const startTime = parseTimestampToSeconds(parts[1]);
      const endTime = Math.max(startTime + 0.3, parseTimestampToSeconds(parts[2]));
      const text = parts
        .slice(9)
        .join(',')
        .replace(/\\N|\\n/g, '\n')
        .replace(/\{\\[^}]*\}/g, '')
        .trim();
      if (text) {
        assCues.push({
          startTime: Number(startTime.toFixed(2)),
          endTime: Number(endTime.toFixed(2)),
          text,
        });
      }
    }
    if (assCues.length > 0) return assCues;
  }

  // LRC lyric timestamp format [mm:ss.xx]Text
  const lrcLines = normalized
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^\[\d+:\d+(?:\.\d+)?\]/.test(l));
  if (lrcLines.length >= 2) {
    const parsedLrc: Array<{ time: number; text: string }> = [];
    for (const line of lrcLines) {
      const m = /^\[(\d+:\d+(?:\.\d+)?)\](.*)$/.exec(line);
      if (!m) continue;
      const t = parseTimestampToSeconds(m[1]);
      const txt = m[2].trim();
      if (txt) parsedLrc.push({ time: t, text: txt });
    }
    if (parsedLrc.length > 0) {
      return parsedLrc.map((entry, idx) => {
        const nextT = parsedLrc[idx + 1]?.time;
        const endT = nextT && nextT > entry.time + 0.3 ? nextT : entry.time + 2.5;
        return {
          startTime: Number(entry.time.toFixed(2)),
          endTime: Number(endT.toFixed(2)),
          text: entry.text,
        };
      });
    }
  }

  const blocks = normalized.split(/\n{2,}/);
  const cues: CaptionCue[] = [];

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length === 0) continue;
    const header = lines[0].toUpperCase();
    if (
      header.startsWith('WEBVTT') ||
      header.startsWith('NOTE') ||
      header.startsWith('STYLE') ||
      header.startsWith('REGION')
    ) {
      continue;
    }

    // Standard SRT/VTT (-->) or YouTube SBV (start,end)
    const timingLineIdx = lines.findIndex(
      (l) => l.includes('-->') || /^\d+:\d{2}:\d{2}(?:\.\d+)?,\d+:\d{2}:\d{2}(?:\.\d+)?$/.test(l)
    );
    if (timingLineIdx === -1) continue;

    const timingLine = lines[timingLineIdx];
    const [startRaw, endRawWithSettings] = timingLine.includes('-->')
      ? timingLine.split('-->')
      : timingLine.split(',');
    if (!startRaw || !endRawWithSettings) continue;

    const endRaw = endRawWithSettings.trim().split(/\s+/)[0] ?? '';
    const startTime = parseTimestampToSeconds(startRaw);
    const endTime = Math.max(startTime + 0.3, parseTimestampToSeconds(endRaw));
    const text = lines
      .slice(timingLineIdx + 1)
      .join('\n')
      .replace(/\{\\[^}]*\}/g, '') // Strip ASS/SSA inline override tags
      .replace(/<[^>]+>/g, '') // Strip HTML/WebVTT voice & style tags
      .trim();

    if (text) {
      cues.push({
        startTime: Number(startTime.toFixed(2)),
        endTime: Number(endTime.toFixed(2)),
        text,
      });
    }
  }

  return cues;
}

const SPACELESS_SCRIPT_RE = /[\u4E00-\u9FFF\u3040-\u30FF\u0E00-\u0E7F\u1000-\u109F\u1780-\u17FF]/;

export function splitScriptIntoCaptionCues(
  script: string,
  startAt = 0,
  secondsPerCue = 2.4,
  maxWordsPerCue = 6
): CaptionCue[] {
  const safeDur = clamp(secondsPerCue, 0.6, 15);
  const maxWords = clamp(Math.round(maxWordsPerCue), 1, 16);
  const rawLines = script
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const phrases: string[] = [];
  for (const line of rawLines) {
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length === 1 && SPACELESS_SCRIPT_RE.test(line) && Array.from(line).length > maxWords * 2) {
      // Split spaceless scripts (Chinese/Japanese/Thai/Myanmar/Khmer) by grapheme chunks
      const chars = Array.from(line);
      const chunkSize = Math.max(6, maxWords * 2);
      for (let i = 0; i < chars.length; i += chunkSize) {
        phrases.push(chars.slice(i, i + chunkSize).join(''));
      }
      continue;
    }

    if (words.length <= maxWords) {
      phrases.push(words.join(' '));
    } else {
      for (let i = 0; i < words.length; i += maxWords) {
        phrases.push(words.slice(i, i + maxWords).join(' '));
      }
    }
  }

  let cursor = Math.max(0, startAt);
  return phrases.map((text) => {
    const unitCount = SPACELESS_SCRIPT_RE.test(text) && !/\s/.test(text)
      ? Math.max(1, Array.from(text).length / 2)
      : text.split(/\s+/).length;
    const wordScale = clamp(unitCount / maxWords, 0.65, 1.35);
    const dur = Number((safeDur * wordScale).toFixed(2));
    const cue: CaptionCue = {
      startTime: Number(cursor.toFixed(2)),
      endTime: Number((cursor + dur).toFixed(2)),
      text,
    };
    cursor += dur;
    return cue;
  });
}

function getSortedCaptionSourceClips(clips: TimelineClip[]): TimelineClip[] {
  const captionClips = clips.filter((c) => isTitleTrack(c.track) && c.textConfig?.isCaption);
  const sourceClips =
    captionClips.length > 0
      ? captionClips
      : clips.filter((c) => isTitleTrack(c.track) && c.textConfig?.text.trim());

  return [...sourceClips].sort((a, b) => a.startTime - b.startTime);
}

export function exportClipsToSrt(clips: TimelineClip[]): string {
  const sorted = getSortedCaptionSourceClips(clips);
  return sorted
    .map((clip, idx) => {
      const start = formatSubtitleTimestamp(clip.startTime, ',');
      const end = formatSubtitleTimestamp(clip.startTime + clip.duration, ',');
      return `${idx + 1}\n${start} --> ${end}\n${clip.textConfig?.text.trim() ?? ''}`;
    })
    .join('\n\n');
}

export function exportClipsToVtt(clips: TimelineClip[]): string {
  const sorted = getSortedCaptionSourceClips(clips);
  if (sorted.length === 0) return '';
  const body = sorted
    .map((clip) => {
      const start = formatSubtitleTimestamp(clip.startTime, '.');
      const end = formatSubtitleTimestamp(clip.startTime + clip.duration, '.');
      return `${start} --> ${end}\n${clip.textConfig?.text.trim() ?? ''}`;
    })
    .join('\n\n');
  return `WEBVTT\n\n${body}`;
}

function formatAssTimestamp(sec: number): string {
  const safe = Math.max(0, sec);
  const hours = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const cs = Math.min(99, Math.round((safe - Math.floor(safe)) * 100));
  const pad2 = (n: number) => String(n).padStart(2, '0');
  return `${hours}:${pad2(mins)}:${pad2(secs)}.${pad2(cs)}`;
}

export function exportClipsToAss(clips: TimelineClip[]): string {
  const sorted = getSortedCaptionSourceClips(clips);
  if (sorted.length === 0) return '';
  const sampleCfg = sorted[0].textConfig;
  const font = sampleCfg?.fontFamily || 'Plus Jakarta Sans';
  const size = Math.round(sampleCfg?.fontSize || 44);
  const header = `[Script Info]
Title: Framecut Subtitles
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${font},${size},&H00FFFFFF,&H0000FFFF,&H00080605,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,40,40,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  const lines = sorted.map((clip) => {
    const start = formatAssTimestamp(clip.startTime);
    const end = formatAssTimestamp(clip.startTime + clip.duration);
    const text = (clip.textConfig?.text.trim() ?? '').replace(/\n/g, '\\N');
    return `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`;
  });
  return `${header}\n${lines.join('\n')}`;
}

export function exportClipsToTxt(clips: TimelineClip[]): string {
  const sorted = getSortedCaptionSourceClips(clips);
  return sorted
    .map((clip) => clip.textConfig?.text.trim() ?? '')
    .filter(Boolean)
    .join('\n');
}

export function getYForCaptionPosition(
  pos: CaptionPositionPreset,
  safeMargin = 10,
  customY = 34
): number {
  if (pos === 'custom') return clamp(customY, -85, 85);
  const clampedMargin = clamp(safeMargin, 2, 30);
  if (pos === 'top') return -(44 - clampedMargin);
  if (pos === 'center') return 0;
  return 44 - clampedMargin;
}

export function applyCaptionPresetToTextConfig(
  base: TextConfig,
  presetId: CaptionStylePreset
): TextConfig {
  const preset =
    CAPTION_STYLE_PRESETS.find((p) => p.id === presetId) ?? CAPTION_STYLE_PRESETS[0];

  return {
    ...base,
    isCaption: true,
    captionStyle: preset.id,
    captionPosition: base.captionPosition ?? 'bottom',
    captionX: base.captionX,
    captionY: base.captionY,
    captionLineMode: preset.lineMode,
    captionActiveMode: preset.activeMode,
    fontFamily: preset.fontFamily,
    fontSize: preset.fontSize,
    fontWeight: preset.fontWeight,
    color: preset.color,
    align: 'center',
    hasScrim: preset.hasScrim,
    scrimOpacity: preset.scrimOpacity,
    captionBgColor: preset.bgColor,
    captionHighlightColor: preset.highlightColor,
    captionActiveBoxColor: preset.activeBoxColor,
    captionActiveBoxRadius: preset.activeBoxRadius,
    captionOutlineColor: preset.outlineColor,
    captionOutlineWidth: base.captionOutlineWidth ?? preset.outlineWidth,
    captionUppercase: preset.uppercase,
    captionWordHighlight: preset.wordHighlight || preset.activeMode !== 'none',
  };
}

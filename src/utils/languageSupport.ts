export interface CaptionLanguageOption {
  code: string;
  name: string;
  nativeName: string;
  direction: 'ltr' | 'rtl';
  googleFont: string;
}

export const SUPPORTED_CAPTION_LANGUAGES: CaptionLanguageOption[] = [
  { code: 'auto', name: 'Auto Detect (Original)', nativeName: 'Any Spoken / Written Language', direction: 'ltr', googleFont: 'Noto Sans' },
  { code: 'en', name: 'English', nativeName: 'English', direction: 'ltr', googleFont: 'Plus Jakarta Sans' },
  { code: 'hi-Latn', name: 'Hinglish (Roman Hindi/Urdu)', nativeName: 'Hinglish', direction: 'ltr', googleFont: 'Plus Jakarta Sans' },
  { code: 'ur-Latn', name: 'Roman Urdu', nativeName: 'Roman Urdu', direction: 'ltr', googleFont: 'Plus Jakarta Sans' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو', direction: 'rtl', googleFont: 'Noto Nastaliq Urdu' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', direction: 'ltr', googleFont: 'Noto Sans Devanagari' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', direction: 'rtl', googleFont: 'Noto Sans Arabic' },
  { code: 'fa', name: 'Persian / Farsi', nativeName: 'فارسی', direction: 'rtl', googleFont: 'Noto Sans Arabic' },
  { code: 'ps', name: 'Pashto', nativeName: 'پښتو', direction: 'rtl', googleFont: 'Noto Sans Arabic' },
  { code: 'sd', name: 'Sindhi', nativeName: 'سنڌي', direction: 'rtl', googleFont: 'Noto Sans Arabic' },
  { code: 'pa', name: 'Punjabi (Gurmukhi)', nativeName: 'ਪੰਜਾਬੀ', direction: 'ltr', googleFont: 'Noto Sans Gurmukhi' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', direction: 'ltr', googleFont: 'Noto Sans Bengali' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', direction: 'ltr', googleFont: 'Noto Sans Tamil' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', direction: 'ltr', googleFont: 'Noto Sans Telugu' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', direction: 'ltr', googleFont: 'Noto Sans Gujarati' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', direction: 'ltr', googleFont: 'Noto Sans Kannada' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', direction: 'ltr', googleFont: 'Noto Sans Malayalam' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी', direction: 'ltr', googleFont: 'Noto Sans Devanagari' },
  { code: 'ne', name: 'Nepali', nativeName: 'नेपाली', direction: 'ltr', googleFont: 'Noto Sans Devanagari' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', direction: 'ltr', googleFont: 'Noto Sans' },
  { code: 'fr', name: 'French', nativeName: 'Français', direction: 'ltr', googleFont: 'Noto Sans' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', direction: 'ltr', googleFont: 'Noto Sans' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', direction: 'ltr', googleFont: 'Noto Sans' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', direction: 'ltr', googleFont: 'Noto Sans' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', direction: 'ltr', googleFont: 'Noto Sans' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', direction: 'ltr', googleFont: 'Noto Sans' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', direction: 'ltr', googleFont: 'Noto Sans' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', direction: 'ltr', googleFont: 'Noto Sans' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski', direction: 'ltr', googleFont: 'Noto Sans' },
  { code: 'el', name: 'Greek', nativeName: 'Ελληνικά', direction: 'ltr', googleFont: 'Noto Sans' },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית', direction: 'rtl', googleFont: 'Noto Sans Hebrew' },
  { code: 'zh', name: 'Chinese (Simplified)', nativeName: '简体中文', direction: 'ltr', googleFont: 'Noto Sans SC' },
  { code: 'zh-TW', name: 'Chinese (Traditional)', nativeName: '繁體中文', direction: 'ltr', googleFont: 'Noto Sans TC' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', direction: 'ltr', googleFont: 'Noto Sans JP' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', direction: 'ltr', googleFont: 'Noto Sans KR' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย', direction: 'ltr', googleFont: 'Noto Sans Thai' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', direction: 'ltr', googleFont: 'Noto Sans' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', direction: 'ltr', googleFont: 'Noto Sans' },
  { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu', direction: 'ltr', googleFont: 'Noto Sans' },
  { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili', direction: 'ltr', googleFont: 'Noto Sans' },
];

export interface DetectedLanguageInfo {
  languageName: string;
  languageCode: string;
  script: string;
  direction: 'ltr' | 'rtl';
  isRtl: boolean;
  recommendedFont: string;
}

const RTL_CHAR_REGEX = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export function isRtlText(text: string): boolean {
  if (!text) return false;
  return RTL_CHAR_REGEX.test(text);
}

export function detectTextLanguage(text: string): DetectedLanguageInfo {
  const sample = text.trim();
  if (!sample) {
    return {
      languageName: 'Auto Detect',
      languageCode: 'auto',
      script: 'Unicode',
      direction: 'ltr',
      isRtl: false,
      recommendedFont: 'Plus Jakarta Sans',
    };
  }

  // Urdu-specific Arabic script letters: ٹ ڈ ڑ ں ہ ے ھ گ چ پ ژ
  if (/[\u0679\u0688\u0691\u06BA\u06C1\u06D2\u06BE\u06AF\u0686\u067E\u0698]/.test(sample)) {
    const isPersianSpecific = /[\u06CC\u06A9]/.test(sample) && !/[\u06D2\u06C1\u0679\u0688\u0691]/.test(sample);
    if (isPersianSpecific) {
      return {
        languageName: 'Persian / Farsi',
        languageCode: 'fa',
        script: 'Persian Arabic',
        direction: 'rtl',
        isRtl: true,
        recommendedFont: 'Noto Sans Arabic',
      };
    }
    return {
      languageName: 'Urdu',
      languageCode: 'ur',
      script: 'Nastaliq / Arabic',
      direction: 'rtl',
      isRtl: true,
      recommendedFont: 'Noto Nastaliq Urdu',
    };
  }

  // Pashto specific letters: ځ څ ډ ږ ښ ګ ڼ ی ې ۍ
  if (/[\u0681\u0685\u0689\u0696\u069A\u06AB\u06BC\u06D0\u06CD]/.test(sample)) {
    return {
      languageName: 'Pashto',
      languageCode: 'ps',
      script: 'Arabic',
      direction: 'rtl',
      isRtl: true,
      recommendedFont: 'Noto Sans Arabic',
    };
  }

  // General Arabic script
  if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(sample)) {
    return {
      languageName: 'Arabic',
      languageCode: 'ar',
      script: 'Arabic',
      direction: 'rtl',
      isRtl: true,
      recommendedFont: 'Noto Sans Arabic',
    };
  }

  // Hebrew
  if (/[\u0590-\u05FF]/.test(sample)) {
    return {
      languageName: 'Hebrew',
      languageCode: 'he',
      script: 'Hebrew',
      direction: 'rtl',
      isRtl: true,
      recommendedFont: 'Noto Sans Hebrew',
    };
  }

  // Devanagari (Hindi / Marathi / Nepali)
  if (/[\u0900-\u097F]/.test(sample)) {
    return {
      languageName: 'Hindi / Devanagari',
      languageCode: 'hi',
      script: 'Devanagari',
      direction: 'ltr',
      isRtl: false,
      recommendedFont: 'Noto Sans Devanagari',
    };
  }

  // Bengali
  if (/[\u0980-\u09FF]/.test(sample)) {
    return {
      languageName: 'Bengali',
      languageCode: 'bn',
      script: 'Bengali',
      direction: 'ltr',
      isRtl: false,
      recommendedFont: 'Noto Sans Bengali',
    };
  }

  // Gurmukhi (Punjabi)
  if (/[\u0A00-\u0A7F]/.test(sample)) {
    return {
      languageName: 'Punjabi (Gurmukhi)',
      languageCode: 'pa',
      script: 'Gurmukhi',
      direction: 'ltr',
      isRtl: false,
      recommendedFont: 'Noto Sans Gurmukhi',
    };
  }

  // Gujarati
  if (/[\u0A80-\u0AFF]/.test(sample)) {
    return {
      languageName: 'Gujarati',
      languageCode: 'gu',
      script: 'Gujarati',
      direction: 'ltr',
      isRtl: false,
      recommendedFont: 'Noto Sans Gujarati',
    };
  }

  // Tamil
  if (/[\u0B80-\u0BFF]/.test(sample)) {
    return {
      languageName: 'Tamil',
      languageCode: 'ta',
      script: 'Tamil',
      direction: 'ltr',
      isRtl: false,
      recommendedFont: 'Noto Sans Tamil',
    };
  }

  // Telugu
  if (/[\u0C00-\u0C7F]/.test(sample)) {
    return {
      languageName: 'Telugu',
      languageCode: 'te',
      script: 'Telugu',
      direction: 'ltr',
      isRtl: false,
      recommendedFont: 'Noto Sans Telugu',
    };
  }

  // Kannada
  if (/[\u0C80-\u0CFF]/.test(sample)) {
    return {
      languageName: 'Kannada',
      languageCode: 'kn',
      script: 'Kannada',
      direction: 'ltr',
      isRtl: false,
      recommendedFont: 'Noto Sans Kannada',
    };
  }

  // Malayalam
  if (/[\u0D00-\u0D7F]/.test(sample)) {
    return {
      languageName: 'Malayalam',
      languageCode: 'ml',
      script: 'Malayalam',
      direction: 'ltr',
      isRtl: false,
      recommendedFont: 'Noto Sans Malayalam',
    };
  }

  // Thai
  if (/[\u0E00-\u0E7F]/.test(sample)) {
    return {
      languageName: 'Thai',
      languageCode: 'th',
      script: 'Thai',
      direction: 'ltr',
      isRtl: false,
      recommendedFont: 'Noto Sans Thai',
    };
  }

  // Japanese (Hiragana / Katakana)
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(sample)) {
    return {
      languageName: 'Japanese',
      languageCode: 'ja',
      script: 'Kana / Kanji',
      direction: 'ltr',
      isRtl: false,
      recommendedFont: 'Noto Sans JP',
    };
  }

  // Korean (Hangul)
  if (/[\uAC00-\uD7AF\u1100-\u11FF]/.test(sample)) {
    return {
      languageName: 'Korean',
      languageCode: 'ko',
      script: 'Hangul',
      direction: 'ltr',
      isRtl: false,
      recommendedFont: 'Noto Sans KR',
    };
  }

  // Chinese (CJK Unified Ideographs)
  if (/[\u4E00-\u9FFF]/.test(sample)) {
    return {
      languageName: 'Chinese',
      languageCode: 'zh',
      script: 'Han / CJK',
      direction: 'ltr',
      isRtl: false,
      recommendedFont: 'Noto Sans SC',
    };
  }

  // Cyrillic (Russian, Ukrainian, etc.)
  if (/[\u0400-\u04FF]/.test(sample)) {
    const isUkrainian = /[\u0404\u0406\u0407\u0490\u0491\u0454\u0456\u0457]/.test(sample);
    return {
      languageName: isUkrainian ? 'Ukrainian' : 'Russian / Cyrillic',
      languageCode: isUkrainian ? 'uk' : 'ru',
      script: 'Cyrillic',
      direction: 'ltr',
      isRtl: false,
      recommendedFont: 'Noto Sans',
    };
  }

  // Greek
  if (/[\u0370-\u03FF]/.test(sample)) {
    return {
      languageName: 'Greek',
      languageCode: 'el',
      script: 'Greek',
      direction: 'ltr',
      isRtl: false,
      recommendedFont: 'Noto Sans',
    };
  }

  // Vietnamese diacritics
  if (/[\u1EA0-\u1EF9\u0110\u0111\u01A0\u01A1\u01AF\u01B0]/.test(sample)) {
    return {
      languageName: 'Vietnamese',
      languageCode: 'vi',
      script: 'Latin (Vietnamese)',
      direction: 'ltr',
      isRtl: false,
      recommendedFont: 'Noto Sans',
    };
  }

  // Turkish specific chars
  if (/[\u011E\u011F\u0130\u0131\u015E\u015F]/.test(sample)) {
    return {
      languageName: 'Turkish',
      languageCode: 'tr',
      script: 'Latin (Turkish)',
      direction: 'ltr',
      isRtl: false,
      recommendedFont: 'Noto Sans',
    };
  }

  // Spanish inverted punctuation or ñ
  if (/[¿¡ñÑ]/.test(sample)) {
    return {
      languageName: 'Spanish',
      languageCode: 'es',
      script: 'Latin',
      direction: 'ltr',
      isRtl: false,
      recommendedFont: 'Noto Sans',
    };
  }

  // French accents
  if (/[çÇœŒàÀâÂèÈéÉêÊëËîÎïÏôÔùÙûÛ]/.test(sample)) {
    return {
      languageName: 'French',
      languageCode: 'fr',
      script: 'Latin',
      direction: 'ltr',
      isRtl: false,
      recommendedFont: 'Noto Sans',
    };
  }

  // German ß / umlauts
  if (/[ßäöüÄÖÜ]/.test(sample)) {
    return {
      languageName: 'German',
      languageCode: 'de',
      script: 'Latin',
      direction: 'ltr',
      isRtl: false,
      recommendedFont: 'Noto Sans',
    };
  }

  // Portuguese
  if (/[ãÃõÕ]/.test(sample)) {
    return {
      languageName: 'Portuguese',
      languageCode: 'pt',
      script: 'Latin',
      direction: 'ltr',
      isRtl: false,
      recommendedFont: 'Noto Sans',
    };
  }

  // Hinglish / Roman Hindi-Urdu detection in Latin script
  const tokens = sample.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const strongHinglishWords = new Set([
    'nahi', 'nhi', 'nai', 'kya', 'kaise', 'kaisa', 'kaisi', 'raha', 'rahi', 'rahe', 'rha', 'rhi', 'rhe',
    'hain', 'hum', 'aap', 'tum', 'bhai', 'yaar', 'accha', 'acha', 'bahut', 'bohot', 'bhot',
    'mera', 'meri', 'mere', 'tera', 'teri', 'tere', 'hamara', 'tumhara', 'apna', 'apni',
    'karna', 'krna', 'karo', 'kro', 'karta', 'karti', 'karte', 'hoga', 'hogi', 'honge', 'hota', 'hoti',
    'kyun', 'kyu', 'kyunki', 'lekin', 'magar', 'agar', 'abhi', 'phir', 'fir', 'bilkul', 'lazmi',
    'samajh', 'dekho', 'suno', 'chalo', 'chahiye', 'thik', 'theek', 'matlab', 'waqt', 'zindagi',
    'dost', 'pyar', 'khushi', 'yahan', 'wahan', 'kahan', 'jab', 'tab', 'kuch', 'sab', 'bhi',
    'toh', 'mein', 'maine', 'tumne', 'usne', 'unka', 'unke', 'iski', 'iske', 'wala', 'wali', 'wale',
    'saath', 'sath', 'baat', 'kaam', 'din', 'raat', 'ghar', 'dil', 'jaan', 'naam', 'desh',
  ]);
  const softHinglishWords = new Set([
    'hai', 'ho', 'hu', 'hoon', 'ka', 'ki', 'ke', 'ko', 'se', 'sy', 'pe', 'py', 'ne', 'aur', 'par', 'ye', 'yeh', 'wo', 'woh', 'jb', 'ky',
  ]);
  let strongHits = 0;
  let softHits = 0;
  for (const w of tokens) {
    if (strongHinglishWords.has(w)) strongHits++;
    else if (softHinglishWords.has(w)) softHits++;
  }
  if (strongHits >= 1 || softHits >= 2) {
    return {
      languageName: 'Hinglish (Roman Hindi/Urdu)',
      languageCode: 'hi-Latn',
      script: 'Latin (Hinglish)',
      direction: 'ltr',
      isRtl: false,
      recommendedFont: 'Plus Jakarta Sans',
    };
  }

  return {
    languageName: 'English / Latin',
    languageCode: 'en',
    script: 'Latin',
    direction: 'ltr',
    isRtl: false,
    recommendedFont: 'Plus Jakarta Sans',
  };
}

const loadedGoogleScriptFonts = new Set<string>();

export function ensureScriptFontLoaded(fontOrSampleText: string): void {
  if (typeof document === 'undefined') return;

  const looksLikeFontName =
    fontOrSampleText.startsWith('Noto ') ||
    SUPPORTED_CAPTION_LANGUAGES.some((l) => l.googleFont === fontOrSampleText);

  const fontName = looksLikeFontName
    ? fontOrSampleText
    : detectTextLanguage(fontOrSampleText).recommendedFont;

  if (!fontName || fontName === 'Plus Jakarta Sans') return;
  if (loadedGoogleScriptFonts.has(fontName)) return;
  loadedGoogleScriptFonts.add(fontName);

  const encoded = encodeURIComponent(fontName).replace(/%20/g, '+');
  const href = `https://fonts.googleapis.com/css2?family=${encoded}:wght@400;500;600;700&display=swap`;
  const existing = document.querySelector(`link[data-script-font="${fontName}"]`);
  if (existing) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.setAttribute('data-script-font', fontName);
  document.head.appendChild(link);
}

export function buildCanvasFontFamilyStack(primaryFont: string, textSample: string): string {
  const detected = detectTextLanguage(textSample);
  const parts: string[] = [];
  if (primaryFont?.trim()) {
    parts.push(`"${primaryFont.trim()}"`);
  }
  if (detected.recommendedFont && detected.recommendedFont !== primaryFont?.trim()) {
    parts.push(`"${detected.recommendedFont}"`);
  }
  parts.push(
    '"Noto Sans"',
    '"Noto Sans Arabic"',
    '"Noto Nastaliq Urdu"',
    '"Noto Sans Devanagari"',
    '"Noto Sans Bengali"',
    '"Noto Sans SC"',
    '"Noto Sans JP"',
    '"Noto Sans KR"',
    '"Noto Sans Thai"',
    '"Noto Sans Hebrew"',
    '"Segoe UI"',
    '"Apple SD Gothic Neo"',
    'sans-serif'
  );
  return Array.from(new Set(parts)).join(', ');
}

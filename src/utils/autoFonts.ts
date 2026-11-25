import { StoredFontVariant } from './fontStorage';

export type AutoFontCategory =
  | 'Display'
  | 'Sans'
  | 'Serif'
  | 'Script'
  | 'Mono'
  | 'Urdu & Arabic'
  | 'All Languages';

export interface FamousFontItem {
  family: string;
  category: AutoFontCategory;
  tag: string;
}

export const FAMOUS_FONTS_CATALOG: FamousFontItem[] = [
  // Display & Poster
  { family: 'Anton', category: 'Display', tag: 'Heavy YouTube / Reel Impact' },
  { family: 'Archivo Black', category: 'Display', tag: 'Bold Geometric Poster' },
  { family: 'Bangers', category: 'Display', tag: 'Comic / Gaming Energy' },
  { family: 'Black Ops One', category: 'Display', tag: 'Military / Stencil Title' },
  { family: 'Bungee', category: 'Display', tag: 'Urban Block Sign' },
  { family: 'Cinzel', category: 'Display', tag: 'Cinematic Epic Title' },
  { family: 'Righteous', category: 'Display', tag: 'Retro Rounded Display' },
  { family: 'Russo One', category: 'Display', tag: 'Tech / Sports Broadcast' },
  { family: 'Teko', category: 'Display', tag: 'Tall Condensed Headline' },
  { family: 'Titan One', category: 'Display', tag: 'Chunky Pop Headline' },
  { family: 'Staatliches', category: 'Display', tag: 'Sharp All-Caps Poster' },
  { family: 'Abril Fatface', category: 'Display', tag: 'High-Contrast Editorial' },
  { family: 'Alfa Slab One', category: 'Display', tag: 'Ultra Slab Serif' },
  { family: 'Ultra', category: 'Display', tag: 'Bold Vintage Slab' },

  // Clean Sans
  { family: 'Inter', category: 'Sans', tag: 'Clean Modern UI' },
  { family: 'Roboto', category: 'Sans', tag: 'Classic Neutral Sans' },
  { family: 'Open Sans', category: 'Sans', tag: 'Friendly Readable Copy' },
  { family: 'Lato', category: 'Sans', tag: 'Warm Corporate Sans' },
  { family: 'Nunito', category: 'Sans', tag: 'Soft Rounded Sans' },
  { family: 'Raleway', category: 'Sans', tag: 'Elegant Thin-to-Bold' },
  { family: 'Work Sans', category: 'Sans', tag: 'Editorial Clean Sans' },
  { family: 'Manrope', category: 'Sans', tag: 'Sharp Modern Geometric' },
  { family: 'Space Grotesk', category: 'Sans', tag: 'Futuristic Tech Sans' },
  { family: 'Rubik', category: 'Sans', tag: 'Smooth Rounded Corners' },
  { family: 'Quicksand', category: 'Sans', tag: 'Light Playful Rounded' },
  { family: 'Kanit', category: 'Sans', tag: 'Wide Kinetic Sans' },
  { family: 'Jost', category: 'Sans', tag: 'Futura-Inspired Geometric' },
  { family: 'Barlow Condensed', category: 'Sans', tag: 'Crisp Sports Lower-Third' },

  // Editorial Serif
  { family: 'Merriweather', category: 'Serif', tag: 'Classic Documentary Serif' },
  { family: 'PT Serif', category: 'Serif', tag: 'Timeless Editorial Book' },
  { family: 'EB Garamond', category: 'Serif', tag: 'Literary Classical Serif' },
  { family: 'Libre Baskerville', category: 'Serif', tag: 'Refined Storyteller' },
  { family: 'DM Serif Display', category: 'Serif', tag: 'Luxury Magazine Header' },
  { family: 'Bodoni Moda', category: 'Serif', tag: 'High-Fashion Serif' },
  { family: 'Crimson Pro', category: 'Serif', tag: 'Warm Documentary Copy' },
  { family: 'Cinzel Decorative', category: 'Serif', tag: 'Ornate Film Credits' },

  // Script & Handwriting
  { family: 'Pacifico', category: 'Script', tag: 'Retro Brush Script' },
  { family: 'Lobster', category: 'Script', tag: 'Bold Vintage Script' },
  { family: 'Dancing Script', category: 'Script', tag: 'Lively Flowing Cursive' },
  { family: 'Great Vibes', category: 'Script', tag: 'Formal Wedding Calligraphy' },
  { family: 'Caveat', category: 'Script', tag: 'Natural Marker Note' },
  { family: 'Satisfy', category: 'Script', tag: 'Smooth Brush Signature' },
  { family: 'Sacramento', category: 'Script', tag: 'Minimal Monoline Script' },
  { family: 'Kaushan Script', category: 'Script', tag: 'Energetic Dry Brush' },
  { family: 'Permanent Marker', category: 'Script', tag: 'Handwritten Sharpie' },
  { family: 'Shadows Into Light', category: 'Script', tag: 'Clean Journal Handwriting' },

  // Mono & Tech
  { family: 'Fira Code', category: 'Mono', tag: 'Developer Code Mono' },
  { family: 'Space Mono', category: 'Mono', tag: 'Retro Sci-Fi Terminal' },
  { family: 'IBM Plex Mono', category: 'Mono', tag: 'Broadcast Timecode Mono' },
  { family: 'Roboto Mono', category: 'Mono', tag: 'Clean Telemetry Mono' },
  { family: 'Source Code Pro', category: 'Mono', tag: 'Crisp Technical Mono' },
  { family: 'Press Start 2P', category: 'Mono', tag: '8-Bit Arcade Pixel' },

  // Urdu & Arabic
  { family: 'Noto Nastaliq Urdu', category: 'Urdu & Arabic', tag: 'Traditional Urdu Nastaliq' },
  { family: 'Gulzar', category: 'Urdu & Arabic', tag: 'Modern Urdu Nastaliq' },
  { family: 'Noto Naskh Arabic', category: 'Urdu & Arabic', tag: 'Clean Arabic / Urdu Naskh' },
  { family: 'Cairo', category: 'Urdu & Arabic', tag: 'Bold Geometric Arabic' },
  { family: 'Amiri', category: 'Urdu & Arabic', tag: 'Classical Arabic Calligraphy' },
  { family: 'Tajawal', category: 'Urdu & Arabic', tag: 'Modern Clean Arabic' },
  { family: 'Almarai', category: 'Urdu & Arabic', tag: 'High-Legibility Arabic' },

  // All World Languages (Noto Global Scripts)
  { family: 'Noto Sans', category: 'All Languages', tag: 'Latin, Cyrillic, Greek & Vietnamese' },
  { family: 'Noto Sans Devanagari', category: 'All Languages', tag: 'Hindi, Marathi & Nepali' },
  { family: 'Noto Sans Bengali', category: 'All Languages', tag: 'Bengali & Assamese' },
  { family: 'Noto Sans Gurmukhi', category: 'All Languages', tag: 'Punjabi Gurmukhi' },
  { family: 'Noto Sans Tamil', category: 'All Languages', tag: 'Tamil Script' },
  { family: 'Noto Sans Telugu', category: 'All Languages', tag: 'Telugu Script' },
  { family: 'Noto Sans Thai', category: 'All Languages', tag: 'Thai Script' },
  { family: 'Noto Sans Hebrew', category: 'All Languages', tag: 'Hebrew RTL Script' },
  { family: 'Noto Sans JP', category: 'All Languages', tag: 'Japanese Kana & Kanji' },
  { family: 'Noto Sans KR', category: 'All Languages', tag: 'Korean Hangul' },
  { family: 'Noto Sans SC', category: 'All Languages', tag: 'Simplified Chinese' },
];

interface ParsedFontFaceBlock {
  subset: string;
  weight: string;
  style: string;
  url: string;
  unicodeRange?: string;
}

function parseGoogleFontsCss(cssText: string): {
  resolvedFamily?: string;
  blocks: ParsedFontFaceBlock[];
} {
  const blocks: ParsedFontFaceBlock[] = [];
  let resolvedFamily: string | undefined;

  const regex = /(?:\/\*\s*([^*]+?)\s*\*\/\s*)?@font-face\s*\{([^}]+)\}/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(cssText)) !== null) {
    const subset = (match[1] ?? '').trim().toLowerCase();
    const body = match[2];

    const urlMatch = body.match(/url\((['"]?)(https:\/\/[^)'"]+)\1\)/i);
    if (!urlMatch) continue;

    if (!resolvedFamily) {
      const famMatch = body.match(/font-family:\s*['"]([^'"]+)['"]/i);
      if (famMatch) resolvedFamily = famMatch[1];
    }

    const weightMatch = body.match(/font-weight:\s*([^;\n]+)/i);
    const styleMatch = body.match(/font-style:\s*([^;\n]+)/i);
    const rangeMatch = body.match(/unicode-range:\s*([^;\n]+)/i);

    blocks.push({
      subset,
      weight: weightMatch ? weightMatch[1].trim() : '400',
      style: styleMatch ? styleMatch[1].trim() : 'normal',
      url: urlMatch[2],
      unicodeRange: rangeMatch ? rangeMatch[1].trim() : undefined,
    });
  }

  return { resolvedFamily, blocks };
}

export async function downloadGoogleFontVariants(
  requestedFamily: string
): Promise<{ family: string; variants: StoredFontVariant[] }> {
  const cleanName = requestedFamily.trim().replace(/\s+/g, ' ');
  if (!cleanName) {
    throw new Error('Please enter a valid font name.');
  }

  const encoded = encodeURIComponent(cleanName).replace(/%20/g, '+');
  const candidateUrls = [
    `https://fonts.googleapis.com/css2?family=${encoded}:wght@400;600;700&display=swap`,
    `https://fonts.googleapis.com/css2?family=${encoded}:wght@400;700&display=swap`,
    `https://fonts.googleapis.com/css2?family=${encoded}&display=swap`,
  ];

  let cssText = '';
  for (const cssUrl of candidateUrls) {
    try {
      const res = await fetch(cssUrl);
      if (res.ok) {
        cssText = await res.text();
        break;
      }
    } catch {
      // Try next variant URL
    }
  }

  if (!cssText) {
    throw new Error(`Could not find "${cleanName}" in Google Fonts.`);
  }

  const { resolvedFamily, blocks } = parseGoogleFontsCss(cssText);
  if (blocks.length === 0) {
    throw new Error(`No downloadable font files found for "${cleanName}".`);
  }

  // Keep essential global subsets across Latin, RTL, South Asian, CJK, Cyrillic, Greek, and Thai
  const preferredSubsets = new Set([
    'latin',
    'latin-ext',
    'arabic',
    'hebrew',
    'devanagari',
    'bengali',
    'gurmukhi',
    'gujarati',
    'tamil',
    'telugu',
    'kannada',
    'malayalam',
    'thai',
    'cyrillic',
    'cyrillic-ext',
    'greek',
    'greek-ext',
    'vietnamese',
    'japanese',
    'korean',
    'chinese-simplified',
    'chinese-traditional',
  ]);
  let selected = blocks.filter((b) => !b.subset || preferredSubsets.has(b.subset));
  if (selected.length === 0) {
    selected = blocks;
  }

  // Deduplicate identical URLs
  const seenUrls = new Set<string>();
  const uniqueBlocks = selected.filter((b) => {
    if (seenUrls.has(b.url)) return false;
    seenUrls.add(b.url);
    return true;
  });

  const variants: StoredFontVariant[] = await Promise.all(
    uniqueBlocks.map(async (block) => {
      const fontRes = await fetch(block.url);
      if (!fontRes.ok) {
        throw new Error(`Failed to download font binary for ${cleanName}`);
      }
      const buffer = await fontRes.arrayBuffer();
      return {
        buffer,
        weight: block.weight,
        style: block.style,
        unicodeRange: block.unicodeRange,
      };
    })
  );

  return {
    family: resolvedFamily || cleanName,
    variants,
  };
}

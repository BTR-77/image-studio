// The choices a member has on the create and edit pages, shared by the
// pages and the server so both enforce the same limits.

export const PROMPT_MAX = 3000;
export const MAX_COUNT = 4;
export const MAX_REFERENCES = 4;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const DEFAULT_DAILY_LIMIT = 50;
export const MAX_DAILY_LIMIT = 10000;
export const PAGE_SIZE = 12;

export const ASPECT_RATIOS = ["1:1", "4:3", "3:4", "16:9", "9:16"] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

/** Output size in pixels for each aspect ratio. */
export const DIMENSIONS: Record<
  AspectRatio,
  { width: number; height: number }
> = {
  "1:1": { width: 1024, height: 1024 },
  "4:3": { width: 1024, height: 768 },
  "3:4": { width: 768, height: 1024 },
  "16:9": { width: 1280, height: 720 },
  "9:16": { width: 720, height: 1280 },
};

export const STYLES = [
  "none",
  "photorealistic",
  "anime",
  "oil-painting",
  "digital-art",
  "watercolor",
] as const;
export type Style = (typeof STYLES)[number];

export const STYLE_LABELS: Record<Style, string> = {
  none: "None",
  photorealistic: "Photorealistic",
  anime: "Anime",
  "oil-painting": "Oil painting",
  "digital-art": "Digital art",
  watercolor: "Watercolor",
};

/** What the model is told for each style, after the prompt. */
export const STYLE_PROMPTS: Record<Style, string> = {
  none: "",
  photorealistic:
    "Photorealistic photograph, natural lighting, fine detail, realistic textures.",
  anime: "Anime illustration, clean line art, cel shading, vibrant colors.",
  "oil-painting":
    "Oil painting on canvas, visible brush strokes, rich layered color.",
  "digital-art": "Polished digital art, crisp detail, dramatic lighting.",
  watercolor: "Watercolor painting, soft washes, paper texture, gentle bleeds.",
};

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Why a file can't be used as an input image, or null when it can. */
export function fileProblem(file: {
  name: string;
  type: string;
  size: number;
}) {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return `${file.name} isn't a JPG, PNG or WebP image.`;
  }
  if (file.size > MAX_FILE_BYTES) {
    return `${file.name} is larger than 10 MB.`;
  }
  if (file.size === 0) return `${file.name} is empty.`;
  return null;
}

/** The UTC day a moment falls on, as YYYY-MM-DD. */
export function utcDay(at: Date = new Date()): string {
  return at.toISOString().slice(0, 10);
}

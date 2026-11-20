import { env } from "cloudflare:workers";
import { PROMPT_MAX } from "@/shared/options";
import { sniffType, type ImageType } from "@/server/imageInfo";

// One fixed model per job, run on the account's Workers AI.
const IMAGE_MODEL = "@cf/black-forest-labs/flux-2-dev";
const TEXT_MODEL = "@cf/meta/llama-3.1-8b-instruct";

type Run = (model: string, inputs: unknown) => Promise<unknown>;
const run: Run = (model, inputs) =>
  (env.AI as unknown as { run: Run }).run(model, inputs);

export interface ImageInput {
  bytes: Uint8Array;
  contentType: string;
}

interface MadeImage {
  bytes: Uint8Array;
  contentType: ImageType;
}

/**
 * One picture from the image model. `inputs` (at most four) steer it: the
 * references of a creation, or the picture an edit changes.
 */
export async function makeImage(options: {
  prompt: string;
  width: number;
  height: number;
  inputs: ImageInput[];
}): Promise<MadeImage> {
  const form = new FormData();
  form.append("prompt", options.prompt);
  form.append("width", String(options.width));
  form.append("height", String(options.height));
  options.inputs.forEach((input, index) => {
    form.append(
      `input_image_${index}`,
      new Blob([input.bytes as Uint8Array<ArrayBuffer>], {
        type: input.contentType,
      }),
      `input-${index}`,
    );
  });
  const body = new Response(form);
  const result = (await run(IMAGE_MODEL, {
    multipart: {
      body: body.body,
      contentType: body.headers.get("content-type"),
    },
  })) as { image?: string } | null;
  if (!result?.image) throw new Error("The image model returned no picture.");
  const bytes = Uint8Array.from(atob(result.image), (c) => c.charCodeAt(0));
  const contentType = sniffType(bytes);
  if (!contentType)
    throw new Error("The image model returned an unreadable picture.");
  return { bytes, contentType };
}

const ENHANCE_INSTRUCTION = `You write prompts for an image generator. Turn the user's idea into one vivid, specific prompt: the subject, setting, composition, lighting, colours, mood and level of detail. Keep everything the user asked for and invent nothing that contradicts it. Answer with the prompt alone, in plain text, in at most 120 words, without quotes, labels or commentary.`;

/** A richer prompt written from a short idea. */
export async function enhancePrompt(idea: string): Promise<string> {
  const result = (await run(TEXT_MODEL, {
    messages: [
      { role: "system", content: ENHANCE_INSTRUCTION },
      { role: "user", content: idea },
    ],
    max_tokens: 400,
  })) as { response?: string } | null;
  const text = (result?.response ?? "")
    .trim()
    .replace(/^(prompt:\s*)/i, "")
    .replace(/^["“]|["”]$/g, "")
    .trim();
  if (!text) throw new Error("No prompt came back.");
  return text.slice(0, PROMPT_MAX);
}

/** A model failure as a sentence a member can read. */
export function describeFailure(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const detail = raw
    .replace(/^(AiError|Error):\s*/i, "")
    .trim()
    .slice(0, 240);
  return detail
    ? `The image model couldn't make this picture: ${detail}`
    : "The image model couldn't make this picture.";
}

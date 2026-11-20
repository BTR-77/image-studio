import { and, count as countRows, desc, eq, inArray } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { db } from "@/db";
import { generations, images, inputs } from "@/db/schema";
import { describeFailure, makeImage, type ImageInput } from "@/server/ai";
import { dimensionsOf, outputSizeFor, sniffType } from "@/server/imageInfo";
import { releaseImages, reserveImages } from "@/server/usage";
import {
  ASPECT_RATIOS,
  DIMENSIONS,
  MAX_COUNT,
  MAX_FILE_BYTES,
  MAX_REFERENCES,
  PAGE_SIZE,
  PROMPT_MAX,
  STYLES,
  STYLE_PROMPTS,
  fileProblem,
  utcDay,
  type AspectRatio,
  type Style,
} from "@/shared/options";

const bucket = () => env.images;

export interface GenerationDetail {
  id: string;
  kind: "generate" | "edit";
  prompt: string;
  style: string;
  aspectRatio: string;
  count: number;
  status: "running" | "succeeded" | "failed";
  error: string | null;
  createdAt: string;
  sourceImageId: string | null;
  images: { id: string }[];
  inputs: { id: string; role: "reference" | "source" }[];
}

type Outcome =
  | { ok: true; generation: GenerationDetail }
  | { ok: false; error: string };

/** A request that can't be served, with the sentence to show. */
class Refusal extends Error {}

// ---- Reading what the page sent ------------------------------------------

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function prompt(form: FormData, name: string, what: string): string {
  const value = text(form, name).trim();
  if (!value) throw new Refusal(`Write ${what} first.`);
  if (value.length > PROMPT_MAX)
    throw new Refusal(`Keep ${what} to ${PROMPT_MAX} characters.`);
  return value;
}

function imageCount(form: FormData): number {
  const value = Number(text(form, "count") || "1");
  if (!Number.isInteger(value) || value < 1 || value > MAX_COUNT)
    throw new Refusal(`Choose between 1 and ${MAX_COUNT} images.`);
  return value;
}

async function readImages(files: FormDataEntryValue[]): Promise<ImageInput[]> {
  const read: ImageInput[] = [];
  for (const file of files) {
    if (typeof file === "string")
      throw new Refusal("That file couldn't be read.");
    const problem = fileProblem(file);
    if (problem) throw new Refusal(problem);
    if (file.size > MAX_FILE_BYTES)
      throw new Refusal(`${file.name} is larger than 10 MB.`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const contentType = sniffType(bytes);
    if (!contentType)
      throw new Refusal(`${file.name} isn't a JPG, PNG or WebP image.`);
    read.push({ bytes, contentType });
  }
  return read;
}

// ---- Running the model ----------------------------------------------------

interface Run {
  userId: string;
  kind: "generate" | "edit";
  prompt: string;
  modelPrompt: string;
  style: string;
  aspectRatio: string;
  width: number;
  height: number;
  count: number;
  sourceImageId: string | null;
  inputs: (ImageInput & { role: "reference" | "source" })[];
}

async function runGeneration(run: Run): Promise<Outcome> {
  const day = utcDay();
  if (!(await reserveImages(run.userId, run.count, day))) {
    return {
      ok: false,
      error: "That would go over your daily limit.",
    };
  }
  const id = crypto.randomUUID();
  const inputRows = run.inputs.map((input, position) => ({
    id: crypto.randomUUID(),
    generationId: id,
    userId: run.userId,
    role: input.role,
    position,
    r2Key: `${run.userId}/${id}/input-${position}`,
    contentType: input.contentType,
  }));
  try {
    await Promise.all(
      inputRows.map((row, index) =>
        bucket().put(row.r2Key, run.inputs[index]!.bytes, {
          httpMetadata: { contentType: row.contentType },
        }),
      ),
    );
    const insertGeneration = db.insert(generations).values({
      id,
      userId: run.userId,
      kind: run.kind,
      prompt: run.prompt,
      style: run.style,
      aspectRatio: run.aspectRatio,
      count: run.count,
      sourceImageId: run.sourceImageId,
    });
    if (inputRows.length)
      await db.batch([insertGeneration, db.insert(inputs).values(inputRows)]);
    else await insertGeneration;
  } catch (error) {
    await releaseImages(run.userId, run.count, day);
    throw error;
  }

  const results = await Promise.allSettled(
    Array.from({ length: run.count }, () =>
      makeImage({
        prompt: run.modelPrompt,
        width: run.width,
        height: run.height,
        inputs: run.inputs,
      }),
    ),
  );
  const made = results.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  const firstFailure = results.find((result) => result.status === "rejected");

  if (made.length === 0) {
    const message = describeFailure(
      firstFailure?.status === "rejected" ? firstFailure.reason : null,
    );
    await db
      .update(generations)
      .set({ status: "failed", error: message })
      .where(eq(generations.id, id));
    await releaseImages(run.userId, run.count, day);
  } else {
    const imageRows = made.map((image, position) => ({
      id: crypto.randomUUID(),
      generationId: id,
      userId: run.userId,
      position,
      r2Key: `${run.userId}/${id}/${position}`,
      contentType: image.contentType,
    }));
    await Promise.all(
      imageRows.map((row, index) =>
        bucket().put(row.r2Key, made[index]!.bytes, {
          httpMetadata: { contentType: row.contentType },
        }),
      ),
    );
    await db.batch([
      db.insert(images).values(imageRows),
      db
        .update(generations)
        .set({ status: "succeeded", count: made.length })
        .where(eq(generations.id, id)),
    ]);
    await releaseImages(run.userId, run.count - made.length, day);
  }
  const generation = await getGeneration(run.userId, id);
  return { ok: true, generation: generation! };
}

// ---- Creating and editing -------------------------------------------------

/** A creation from a prompt, steered by up to four reference images. */
export async function createFromPrompt(
  userId: string,
  form: FormData,
): Promise<Outcome> {
  try {
    const text_ = prompt(form, "prompt", "a prompt");
    const style = text(form, "style") || "none";
    if (!(STYLES as readonly string[]).includes(style))
      throw new Refusal("Choose one of the listed styles.");
    const aspectRatio = text(form, "aspectRatio") || "1:1";
    if (!(ASPECT_RATIOS as readonly string[]).includes(aspectRatio))
      throw new Refusal("Choose one of the listed aspect ratios.");
    const count = imageCount(form);
    const files = form.getAll("references");
    if (files.length > MAX_REFERENCES)
      throw new Refusal(`Attach at most ${MAX_REFERENCES} reference images.`);
    const references = await readImages(files);
    const styleText = STYLE_PROMPTS[style as Style];
    const size = DIMENSIONS[aspectRatio as AspectRatio];
    return await runGeneration({
      userId,
      kind: "generate",
      prompt: text_,
      modelPrompt: styleText ? `${text_}\n\n${styleText}` : text_,
      style,
      aspectRatio,
      ...size,
      count,
      sourceImageId: null,
      inputs: references.map((input) => ({ ...input, role: "reference" })),
    });
  } catch (error) {
    if (error instanceof Refusal) return { ok: false, error: error.message };
    throw error;
  }
}

/** Changes to one image, described in words: an upload or one of the member's own. */
export async function createEdit(
  userId: string,
  form: FormData,
): Promise<Outcome> {
  try {
    const instruction = prompt(form, "instruction", "what to change");
    const count = imageCount(form);
    const sourceImageId = text(form, "sourceImageId") || null;
    let source: ImageInput;
    if (sourceImageId) {
      const [row] = await db
        .select({ r2Key: images.r2Key, contentType: images.contentType })
        .from(images)
        .where(and(eq(images.id, sourceImageId), eq(images.userId, userId)));
      const object = row ? await bucket().get(row.r2Key) : null;
      if (!row || !object) throw new Refusal("That image isn't available.");
      source = {
        bytes: new Uint8Array(await object.arrayBuffer()),
        contentType: row.contentType,
      };
    } else {
      const file = form.get("source");
      if (!file) throw new Refusal("Choose an image to edit.");
      [source] = (await readImages([file])) as [ImageInput];
    }
    return await runGeneration({
      userId,
      kind: "edit",
      prompt: instruction,
      modelPrompt: instruction,
      style: "none",
      aspectRatio: "source",
      ...outputSizeFor(dimensionsOf(source.bytes)),
      count,
      sourceImageId,
      inputs: [{ ...source, role: "source" }],
    });
  } catch (error) {
    if (error instanceof Refusal) return { ok: false, error: error.message };
    throw error;
  }
}

// ---- History ---------------------------------------------------------------

interface HistoryItem {
  id: string;
  kind: "generate" | "edit";
  prompt: string;
  status: "running" | "succeeded" | "failed";
  count: number;
  createdAt: string;
  thumbnailId: string | null;
}

export async function listGenerations(
  userId: string,
  page: number,
): Promise<{
  items: HistoryItem[];
  total: number;
  page: number;
  pages: number;
}> {
  const [{ total } = { total: 0 }] = await db
    .select({ total: countRows() })
    .from(generations)
    .where(eq(generations.userId, userId));
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pages);
  const rows = await db
    .select({
      id: generations.id,
      kind: generations.kind,
      prompt: generations.prompt,
      status: generations.status,
      count: generations.count,
      createdAt: generations.createdAt,
    })
    .from(generations)
    .where(eq(generations.userId, userId))
    .orderBy(desc(generations.createdAt), desc(generations.id))
    .limit(PAGE_SIZE)
    .offset((current - 1) * PAGE_SIZE);
  const thumbs = rows.length
    ? await db
        .select({ id: images.id, generationId: images.generationId })
        .from(images)
        .where(
          and(
            eq(images.userId, userId),
            eq(images.position, 0),
            inArray(
              images.generationId,
              rows.map((row) => row.id),
            ),
          ),
        )
    : [];
  const thumbOf = new Map(
    thumbs.map((thumb) => [thumb.generationId, thumb.id]),
  );
  return {
    items: rows.map((row) => ({
      ...row,
      thumbnailId: thumbOf.get(row.id) ?? null,
    })),
    total,
    page: current,
    pages,
  };
}

/** One of the member's generations, or null when they have none with this id. */
export async function getGeneration(
  userId: string,
  id: string,
): Promise<GenerationDetail | null> {
  const [row] = await db
    .select()
    .from(generations)
    .where(and(eq(generations.id, id), eq(generations.userId, userId)));
  if (!row) return null;
  const [imageRows, inputRows] = await Promise.all([
    db
      .select({ id: images.id })
      .from(images)
      .where(and(eq(images.generationId, id), eq(images.userId, userId)))
      .orderBy(images.position),
    db
      .select({ id: inputs.id, role: inputs.role })
      .from(inputs)
      .where(and(eq(inputs.generationId, id), eq(inputs.userId, userId)))
      .orderBy(inputs.position),
  ]);
  return {
    id: row.id,
    kind: row.kind,
    prompt: row.prompt,
    style: row.style,
    aspectRatio: row.aspectRatio,
    count: row.count,
    status: row.status,
    error: row.error,
    createdAt: row.createdAt,
    sourceImageId: row.sourceImageId,
    images: imageRows,
    inputs: inputRows,
  };
}

/** Deletes a generation, its pictures and its inputs. False when it isn't the member's. */
export async function deleteGeneration(
  userId: string,
  id: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: generations.id })
    .from(generations)
    .where(and(eq(generations.id, id), eq(generations.userId, userId)));
  if (!row) return false;
  const [imageKeys, inputKeys] = await Promise.all([
    db
      .select({ key: images.r2Key })
      .from(images)
      .where(and(eq(images.generationId, id), eq(images.userId, userId))),
    db
      .select({ key: inputs.r2Key })
      .from(inputs)
      .where(and(eq(inputs.generationId, id), eq(inputs.userId, userId))),
  ]);
  const keys = [...imageKeys, ...inputKeys].map((row) => row.key);
  if (keys.length) await bucket().delete(keys);
  await db.batch([
    db
      .delete(images)
      .where(and(eq(images.generationId, id), eq(images.userId, userId))),
    db
      .delete(inputs)
      .where(and(eq(inputs.generationId, id), eq(inputs.userId, userId))),
    db
      .delete(generations)
      .where(and(eq(generations.id, id), eq(generations.userId, userId))),
  ]);
  return true;
}

/** A stored picture or input of the member's, for the file routes. */
export async function findFile(
  userId: string,
  table: "images" | "inputs",
  id: string,
): Promise<{ key: string; contentType: string } | null> {
  const source = table === "images" ? images : inputs;
  const [row] = await db
    .select({ key: source.r2Key, contentType: source.contentType })
    .from(source)
    .where(and(eq(source.id, id), eq(source.userId, userId)));
  return row ?? null;
}

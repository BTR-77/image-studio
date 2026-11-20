import { createServerFn } from "@tanstack/react-start";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { z } from "zod";
import { enhancePrompt as enhance } from "@/server/ai";
import * as generations from "@/server/generations";
import { getUsage as usageOf } from "@/server/usage";
import { ensureUser } from "@/server/users";
import { PROMPT_MAX } from "@/shared/options";

// Every function runs behind ensureUserMiddleware: `context.user` is the
// member the Gateway signed in, and every query takes their id.

function formData(data: unknown): FormData {
  if (!(data instanceof FormData)) throw new Error("Expected form data");
  return data;
}

export const getUsage = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(({ context }) => usageOf(context.user.id));

export const createImages = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator(formData)
  .handler(async ({ data, context: { user } }) => {
    await ensureUser(user);
    return generations.createFromPrompt(user.id, data);
  });

export const editImage = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator(formData)
  .handler(async ({ data, context: { user } }) => {
    await ensureUser(user);
    return generations.createEdit(user.id, data);
  });

const enhanceInput = z.object({ prompt: z.string().max(PROMPT_MAX) }).strict();

export const enhancePrompt = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => enhanceInput.parse(data))
  .handler(async ({ data }) => {
    const idea = data.prompt.trim();
    if (!idea) return { ok: false as const, error: "Write an idea first." };
    try {
      return { ok: true as const, prompt: await enhance(idea) };
    } catch {
      return {
        ok: false as const,
        error: "The prompt couldn't be rewritten. Try again.",
      };
    }
  });

const listInput = z
  .object({ page: z.number().int().min(1).max(100000) })
  .strict();

export const listGenerations = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => listInput.parse(data))
  .handler(({ data, context }) =>
    generations.listGenerations(context.user.id, data.page),
  );

const idInput = z.object({ id: z.string().uuid() }).strict();

export const getGeneration = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => idInput.parse(data))
  .handler(({ data, context }) =>
    generations.getGeneration(context.user.id, data.id),
  );

export const deleteGeneration = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => idInput.parse(data))
  .handler(({ data, context }) =>
    generations.deleteGeneration(context.user.id, data.id),
  );

/** Whether a picture is the caller's own, so the editor can start from it. */
export const hasImage = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => idInput.parse(data))
  .handler(
    async ({ data, context }) =>
      (await generations.findFile(context.user.id, "images", data.id)) !== null,
  );

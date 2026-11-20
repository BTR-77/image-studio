import { createServerFn } from "@tanstack/react-start";
import { isAdmin } from "@every-app/sdk/server";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { z } from "zod";
import { getDailyLimit, setDailyLimit } from "@/server/usage";
import { MAX_DAILY_LIMIT } from "@/shared/options";

/** The workspace settings, for admins only; null for everyone else. */
export const getSettings = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(async ({ context: { user } }) =>
    isAdmin(user) ? { dailyImageLimit: await getDailyLimit() } : null,
  );

const limitInput = z
  .object({ dailyImageLimit: z.number().int().min(0).max(MAX_DAILY_LIMIT) })
  .strict();

export const saveSettings = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => limitInput.parse(data))
  .handler(async ({ data, context: { user } }) => {
    if (!isAdmin(user)) throw new Error("Only admins can change this.");
    return { dailyImageLimit: await setDailyLimit(data.dailyImageLimit) };
  });

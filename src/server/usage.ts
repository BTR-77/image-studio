import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { dailyUsage, settings } from "@/db/schema";
import { DEFAULT_DAILY_LIMIT, utcDay } from "@/shared/options";

const limitSql = sql`coalesce((select ${settings.dailyImageLimit} from ${settings} where ${settings.id} = 1), ${DEFAULT_DAILY_LIMIT})`;

export async function getDailyLimit(): Promise<number> {
  const [row] = await db
    .select({ limit: settings.dailyImageLimit })
    .from(settings)
    .where(eq(settings.id, 1));
  return row?.limit ?? DEFAULT_DAILY_LIMIT;
}

export async function setDailyLimit(limit: number): Promise<number> {
  await db
    .insert(settings)
    .values({ id: 1, dailyImageLimit: limit })
    .onConflictDoUpdate({
      target: settings.id,
      set: { dailyImageLimit: limit },
    });
  return limit;
}

export interface Usage {
  used: number;
  limit: number;
  remaining: number;
}

export async function getUsage(userId: string): Promise<Usage> {
  const [[row], limit] = await Promise.all([
    db
      .select({ images: dailyUsage.images })
      .from(dailyUsage)
      .where(and(eq(dailyUsage.userId, userId), eq(dailyUsage.day, utcDay()))),
    getDailyLimit(),
  ]);
  const used = row?.images ?? 0;
  return { used, limit, remaining: Math.max(0, limit - used) };
}

/**
 * Holds `count` images of today's allowance, in one statement so two
 * requests at once can't both pass the limit. False when they don't fit.
 */
export async function reserveImages(
  userId: string,
  count: number,
  day: string,
): Promise<boolean> {
  const result = await db.run(sql`
    insert into ${dailyUsage} (user_id, day, images)
    select ${userId}, ${day}, ${count} where ${count} <= ${limitSql}
    on conflict (user_id, day) do update set images = daily_usage.images + excluded.images
    where daily_usage.images + excluded.images <= ${limitSql}`);
  return (result.meta.changes ?? 0) > 0;
}

/** Gives back images that were held but not made. */
export async function releaseImages(
  userId: string,
  count: number,
  day: string,
) {
  if (count <= 0) return;
  await db
    .update(dailyUsage)
    .set({ images: sql`max(0, ${dailyUsage.images} - ${count})` })
    .where(and(eq(dailyUsage.userId, userId), eq(dailyUsage.day, day)));
}

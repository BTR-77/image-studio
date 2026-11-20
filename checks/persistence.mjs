// What a member makes and what an admin sets survive a restart.
import {
  expect,
  generate,
  open,
  shownImageIds,
  startStudio,
} from "./support.mjs";

const runtime = await startStudio();
try {
  const page = await (await runtime.context("owner")).newPage();
  await generate(page, {
    prompt: "A paper boat on a puddle after rain",
    count: "2",
    aspect: "4:3",
    style: "Anime",
  });
  const ids = await shownImageIds(page);
  const before = await Promise.all(
    ids.map(async (id) =>
      Buffer.from(
        await (
          await runtime.fetch(`/api/images/${id}`, { role: "owner" })
        ).arrayBuffer(),
      ),
    ),
  );
  await open(page, "/settings");
  await page.getByTestId("daily-limit").fill("7");
  await page.getByTestId("save-limit").click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await runtime.restart();

  const after = await (await runtime.context("owner")).newPage();
  await open(after, "/history");
  await expect(after.getByTestId("history-item")).toHaveCount(1);
  await expect(after.getByTestId("history-item")).toContainText(
    "A paper boat on a puddle after rain",
  );
  await after.getByTestId("history-item").click();
  await expect(after.getByTestId("detail-image")).toHaveCount(2);
  await expect(after.getByTestId("detail-style")).toHaveText("Anime");
  await expect(after.getByTestId("detail-aspect-ratio")).toHaveText("4:3");
  for (const [index, id] of ids.entries()) {
    const response = await runtime.fetch(`/api/images/${id}`, {
      role: "owner",
    });
    expect(response.status).toBe(200);
    expect(
      Buffer.from(await response.arrayBuffer()).equals(before[index]),
    ).toBe(true);
  }
  await open(after, "/");
  await expect(after.getByTestId("usage")).toHaveText(
    "2 of 7 images used today · 5 left",
  );
  await open(after, "/settings");
  await expect(after.getByTestId("daily-limit")).toHaveValue("7");
} finally {
  await runtime.close();
}

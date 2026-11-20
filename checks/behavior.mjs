// The frozen features' main paths, through the packaged release.
import {
  choose,
  expect,
  generate,
  lastImageCall,
  open,
  pngFile,
  shownImageIds,
  startStudio,
} from "./support.mjs";

const runtime = await startStudio();
try {
  const db = await runtime.database();
  const page = await (await runtime.context("owner")).newPage();

  // F005: an empty history first.
  await open(page, "/history");
  await runtime.assertBackLink(page);
  await expect(page.getByTestId("history-empty")).toContainText(
    "Nothing here yet",
  );

  // F006: the create page shows today's use against the default limit.
  await open(page, "/");
  await expect(page.getByTestId("usage")).toHaveText(
    "0 of 50 images used today · 50 left",
  );

  // F002: enhance a short idea, undo, enhance again.
  await expect(page.getByTestId("enhance")).toBeDisabled();
  const idea = "A mountain lake at sunrise";
  await page.getByTestId("prompt").fill(idea);
  await expect(page.getByTestId("prompt-count")).toHaveText(
    `${idea.length} / 3000`,
  );
  await page.getByTestId("enhance").click();
  await expect(page.getByTestId("prompt")).toHaveValue(
    /^A mountain lake at sunrise, seen at first light/,
  );
  const enhanced = await page.getByTestId("prompt").inputValue();
  await expect(page.getByTestId("prompt-count")).toHaveText(
    `${enhanced.length} / 3000`,
  );
  await page.getByTestId("undo-enhance").click();
  await expect(page.getByTestId("prompt")).toHaveValue(idea);
  await page.getByTestId("enhance").click();
  await expect(page.getByTestId("prompt")).toHaveValue(enhanced);
  expect(
    (await db.prepare("select count(*) as n from generations").first()).n,
  ).toBe(0);

  // F001 options.
  await choose(page, "aspect", "16:9");
  await page.getByTestId("style").click();
  await page.getByRole("option", { name: "Watercolor" }).click();
  await expect(page.getByTestId("style")).toContainText("Watercolor");
  await choose(page, "count", "2");

  // F003: wrong types and sizes are refused; thumbnails can be removed.
  const input = page.getByTestId("reference-input");
  await input.setInputFiles({
    name: "notes.gif",
    mimeType: "image/gif",
    buffer: Buffer.from("GIF89a"),
  });
  await expect(page.getByTestId("reference-error")).toContainText(
    "notes.gif isn't a JPG, PNG or WebP image.",
  );
  await input.setInputFiles({
    name: "huge.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
  });
  await expect(page.getByTestId("reference-error")).toContainText(
    "huge.png is larger than 10 MB.",
  );
  await input.setInputFiles([
    pngFile("shore.png", 64, 48, [40, 120, 90]),
    pngFile("sky.png", 64, 48, [220, 150, 90]),
  ]);
  await expect(page.getByTestId("reference-thumb")).toHaveCount(2);
  await expect(page.getByTestId("reference-error")).toHaveCount(0);
  await page.getByRole("button", { name: "Remove sky.png" }).click();
  await expect(page.getByTestId("reference-thumb")).toHaveCount(1);

  // F001: placeholders while it runs, then two downloadable pictures.
  await page.getByTestId("generate").click();
  await expect(page.getByTestId("result-placeholder")).toHaveCount(2);
  await expect(page.getByTestId("result-image")).toHaveCount(2, {
    timeout: 20000,
  });
  await expect(page.getByTestId("result-placeholder")).toHaveCount(0);
  await expect
    .poll(() =>
      page
        .getByTestId("result-image")
        .first()
        .evaluate((img) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  const [firstImage] = await shownImageIds(page);
  await expect(page.getByTestId("download").first()).toHaveAttribute(
    "href",
    `/api/images/${firstImage}?download=1`,
  );
  const download = await runtime.fetch(`/api/images/${firstImage}?download=1`, {
    role: "owner",
  });
  expect(download.status).toBe(200);
  expect(download.headers.get("content-type")).toBe("image/png");
  expect(download.headers.get("content-disposition")).toMatch(
    /^attachment; filename="image-[0-9a-f]{8}\.png"$/,
  );
  expect([
    ...new Uint8Array(await download.arrayBuffer()).subarray(1, 4),
  ]).toEqual([80, 78, 71]);
  await expect(page.getByTestId("usage")).toHaveText(
    "2 of 50 images used today · 48 left",
  );

  const call = await lastImageCall(runtime);
  expect(call.prompt).toContain(enhanced);
  expect(call.prompt).toContain("Watercolor");
  expect([call.width, call.height, call.inputs]).toEqual([1280, 720, 1]);
  const lake = await db
    .prepare("select * from generations where kind = 'generate'")
    .first();
  expect(lake).toMatchObject({
    status: "succeeded",
    style: "watercolor",
    aspect_ratio: "16:9",
    count: 2,
    error: null,
    prompt: enhanced,
  });
  expect(
    (
      await db
        .prepare(
          "select count(*) as n from inputs where generation_id = ? and role = 'reference'",
        )
        .bind(lake.id)
        .first()
    ).n,
  ).toBe(1);
  expect(
    (
      await db
        .prepare("select count(*) as n from images where generation_id = ?")
        .bind(lake.id)
        .first()
    ).n,
  ).toBe(2);

  // F001: a failed model call shows a readable error and is recorded.
  await page.getByTestId("prompt").fill("#fail a harbour at night");
  await choose(page, "count", "1");
  await page.getByTestId("generate").click();
  await expect(page.getByTestId("generation-error")).toContainText(
    "The image model couldn't make this picture: 3030: The prompt was flagged by the safety filter",
    { timeout: 20000 },
  );
  const failed = await db
    .prepare("select * from generations where status = 'failed'")
    .first();
  expect(failed.error).toContain("flagged by the safety filter");
  await expect(page.getByTestId("usage")).toHaveText(
    "2 of 50 images used today · 48 left",
  );

  // F005: history, newest first, then the detail of the lake.
  await open(page, "/history");
  await expect(page.getByTestId("history-item")).toHaveCount(2);
  await expect(page.getByTestId("history-item").first()).toContainText(
    "#fail a harbour at night",
  );
  await expect(page.getByTestId("history-item").first()).toContainText(
    "Failed",
  );
  await expect(page.getByTestId("history-item").nth(1)).toContainText(
    "Created",
  );
  await expect(page.getByTestId("history-item").nth(1)).toContainText("UTC");
  await page.getByTestId("history-item").nth(1).click();
  await expect(page).toHaveURL(new RegExp(`/history/${lake.id}$`));
  await expect(page.getByTestId("detail-image")).toHaveCount(2);
  await expect(page.getByTestId("detail-prompt")).toHaveText(enhanced);
  await expect(page.getByTestId("detail-style")).toHaveText("Watercolor");
  await expect(page.getByTestId("detail-aspect-ratio")).toHaveText("16:9");
  await expect(page.getByTestId("detail-reference")).toHaveCount(1);

  // F005: reuse the prompt on the create form.
  await page.getByTestId("reuse-prompt").click();
  await expect(page).toHaveURL(/\/\?reuse=/);
  await expect(page.getByTestId("prompt")).toHaveValue(enhanced);
  await expect(
    page
      .getByTestId("aspect")
      .getByRole("button", { name: "16:9", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("style")).toContainText("Watercolor");

  // F004: edit one of the member's own pictures from history.
  await open(page, `/history/${lake.id}`);
  await page.getByTestId("edit-image").first().click();
  await expect(page).toHaveURL(new RegExp(`/edit\\?from=${firstImage}`));
  await expect(page.getByTestId("usage")).toHaveText(
    "2 of 50 images used today · 48 left",
  );
  await expect(page.getByTestId("source-preview")).toBeVisible();
  await page
    .getByTestId("instruction")
    .fill("Make it a winter morning with snow on the pines");
  await choose(page, "count", "2");
  await page.getByTestId("apply-edit").click();
  await expect(page.getByTestId("result-placeholder")).toHaveCount(2);
  await expect(page.getByTestId("result-image")).toHaveCount(2, {
    timeout: 20000,
  });
  expect((await lastImageCall(runtime)).inputs).toBe(1);
  const edit = await db
    .prepare("select * from generations where kind = 'edit'")
    .first();
  expect(edit).toMatchObject({
    status: "succeeded",
    source_image_id: firstImage,
    prompt: "Make it a winter morning with snow on the pines",
    count: 2,
  });

  // F004: edit an uploaded picture.
  await open(page, "/edit");
  await expect(page.getByTestId("apply-edit")).toBeDisabled();
  await page
    .getByTestId("source-input")
    .setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("hello"),
    });
  await expect(page.getByTestId("source-error")).toContainText(
    "notes.txt isn't a JPG, PNG or WebP image.",
  );
  await page
    .getByTestId("source-input")
    .setInputFiles(pngFile("porch.png", 120, 80, [180, 120, 70]));
  await expect(page.getByTestId("source-preview")).toBeVisible();
  await page
    .getByTestId("instruction")
    .fill("Turn it into a pencil illustration");
  await page.getByTestId("apply-edit").click();
  await expect(page.getByTestId("result-image")).toHaveCount(1, {
    timeout: 20000,
  });
  const call2 = await lastImageCall(runtime);
  expect([call2.inputs, call2.width, call2.height]).toEqual([1, 1024, 688]);
  await expect(page.getByTestId("usage")).toHaveText(
    "5 of 50 images used today · 45 left",
  );

  // F005: the edits are in history, with their originals.
  await open(page, "/history");
  await expect(page.getByTestId("history-item")).toHaveCount(4);
  await expect(page.getByTestId("history-item").first()).toContainText(
    "Turn it into a pencil illustration",
  );
  await expect(page.getByTestId("history-item").first()).toContainText(
    "Edited",
  );
  await page.getByTestId("history-item").first().click();
  await expect(page.getByTestId("detail-source")).toBeVisible();
  const uploadEdit = page.url().split("/").pop();
  const [uploadEditImage] = await shownImageIds(page, "detail-image");
  const keys = (
    await db
      .prepare(
        "select r2_key as k from images where generation_id = ? union all select r2_key from inputs where generation_id = ?",
      )
      .bind(uploadEdit, uploadEdit)
      .all()
  ).results.map((row) => row.k);
  expect(keys.length).toBe(2);

  // F005: delete asks first, then removes the record and its files.
  await page.getByTestId("delete-generation").click();
  await expect(page.getByRole("alertdialog")).toContainText("Delete this run?");
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Cancel" })
    .click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await page.getByTestId("delete-generation").click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByTestId("history-item")).toHaveCount(3);
  expect(
    await db
      .prepare("select id from generations where id = ?")
      .bind(uploadEdit)
      .first(),
  ).toBeNull();
  expect(
    await db
      .prepare("select id from images where generation_id = ?")
      .bind(uploadEdit)
      .first(),
  ).toBeNull();
  const bucket = await runtime.mf.getR2Bucket("images");
  for (const key of keys) expect(await bucket.head(key)).toBeNull();
  expect(
    (await runtime.fetch(`/api/images/${uploadEditImage}`, { role: "owner" }))
      .status,
  ).toBe(404);

  // F005: pagination, twelve to a page.
  const older = Array.from({ length: 10 }, (_, i) =>
    db
      .prepare(
        "insert into generations (id, user_id, kind, prompt, count, status, created_at) values (?, 'owner', 'generate', ?, 1, 'succeeded', ?)",
      )
      .bind(
        crypto.randomUUID(),
        `Older sketch ${i + 1}`,
        `2026-01-${String(i + 10)}T09:00:00.000Z`,
      ),
  );
  await db.batch(older);
  await open(page, "/history");
  await expect(page.getByTestId("history-item")).toHaveCount(12);
  await expect(page.getByTestId("page-label")).toHaveText("Page 1 of 2");
  await page.getByTestId("next-page").click();
  await expect(page.getByTestId("page-label")).toHaveText("Page 2 of 2");
  await expect(page.getByTestId("history-item")).toHaveCount(1);
  await expect(page.getByTestId("history-item")).toContainText(
    "Older sketch 1",
  );

  // F006: an admin lowers the limit; a member is held to it on both pages.
  await open(page, "/settings");
  await expect(page.getByTestId("daily-limit")).toHaveValue("50");
  await page.getByTestId("daily-limit").fill("3");
  await page.getByTestId("save-limit").click();
  await expect(page.getByText("Saved.")).toBeVisible();
  expect(
    (
      await db
        .prepare("select daily_image_limit as n from settings where id = 1")
        .first()
    ).n,
  ).toBe(3);

  const member = await (await runtime.context("member")).newPage();
  await open(member, "/");
  await expect(member.getByRole("link", { name: "Settings" })).toHaveCount(0);
  await expect(member.getByTestId("usage")).toHaveText(
    "0 of 3 images used today · 3 left",
  );
  await generate(member, {
    prompt: "A red bicycle against a blue wall",
    count: "2",
  });
  await expect(member.getByTestId("usage")).toHaveText(
    "2 of 3 images used today · 1 left",
  );
  await choose(member, "count", "2");
  await member.getByTestId("generate").click();
  await expect(member.getByTestId("generation-error")).toContainText(
    "That would go over your daily limit.",
  );
  await expect(member.getByTestId("result-image")).toHaveCount(0);
  await open(member, "/edit");
  await expect(member.getByTestId("usage")).toHaveText(
    "2 of 3 images used today · 1 left",
  );
  await member.getByTestId("source-input").setInputFiles(pngFile("wall.png"));
  await member.getByTestId("instruction").fill("Paint the wall yellow");
  await choose(member, "count", "2");
  await member.getByTestId("apply-edit").click();
  await expect(member.getByTestId("generation-error")).toContainText(
    "That would go over your daily limit.",
  );
  await choose(member, "count", "1");
  await member.getByTestId("apply-edit").click();
  await expect(member.getByTestId("result-image")).toHaveCount(1, {
    timeout: 20000,
  });
  await expect(member.getByTestId("usage")).toHaveText(
    "3 of 3 images used today · 0 left",
  );

  // Phone-sized smoke.
  const phone = await (
    await runtime.context("member", {
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    })
  ).newPage();
  await open(phone, "/");
  await expect(phone.getByTestId("prompt")).toBeVisible();
  await expect(phone.getByTestId("generate")).toBeVisible();
  expect(
    await phone.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await open(phone, "/history");
  await expect(phone.getByTestId("history-item")).toHaveCount(2);

  // The journey's result, for the app's picture.
  await open(page, `/history/${lake.id}`);
  await expect(page.getByTestId("detail-image")).toHaveCount(2);
  await expect
    .poll(() =>
      page
        .getByTestId("detail-image")
        .nth(1)
        .evaluate((img) => img.complete && img.naturalWidth),
    )
    .toBeGreaterThan(0);
  await runtime.screenshot(page);
} finally {
  await runtime.close();
}

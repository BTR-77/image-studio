// Who may reach what: anonymous and outsiders are refused, members keep to
// their own pictures, admin-only settings refuse members, and there is no
// sign-in of the app's own (X001).
import {
  expect,
  generate,
  open,
  pngFile,
  shownImageIds,
  startStudio,
} from "./support.mjs";

const runtime = await startStudio();
try {
  const db = await runtime.database();
  await runtime.assertPrivateAccess(["/", "/edit", "/history", "/settings"]);

  // The owner makes a picture with a reference image.
  const owner = await (await runtime.context("owner")).newPage();
  await open(owner, "/");
  await owner.getByTestId("prompt").fill("A private sketch of a garden gate");
  await owner.getByTestId("reference-input").setInputFiles(pngFile("ref.png"));
  await expect(owner.getByTestId("reference-thumb")).toHaveCount(1);
  await owner.getByTestId("generate").click();
  await expect(owner.getByTestId("result-image")).toHaveCount(1, {
    timeout: 20000,
  });
  const [ownerImage] = await shownImageIds(owner);
  const ownerGeneration = (
    await db
      .prepare("select id from generations where user_id = 'owner'")
      .first()
  ).id;
  const ownerInputs = (
    await db.prepare("select id from inputs where user_id = 'owner'").all()
  ).results;

  // The files: only their owner gets them.
  expect(
    (await runtime.fetch(`/api/images/${ownerImage}`, { role: "owner" }))
      .status,
  ).toBe(200);
  for (const path of [
    `/api/images/${ownerImage}`,
    `/api/images/${ownerImage}?download=1`,
    ...ownerInputs.map((row) => `/api/inputs/${row.id}`),
  ]) {
    const anonymous = await runtime.fetch(path);
    expect(anonymous.status).not.toBe(200);
    expect(await anonymous.text()).not.toContain("PNG");
    expect((await runtime.fetch(path, { role: "outsider" })).status).not.toBe(
      200,
    );
    expect((await runtime.fetch(path, { role: "member" })).status).toBe(404);
  }

  // Another member sees none of it.
  const member = await (await runtime.context("member")).newPage();
  await open(member, "/history");
  await expect(member.getByTestId("history-empty")).toBeVisible();
  await open(member, `/history/${ownerGeneration}`);
  await expect(member.getByTestId("not-found")).toBeVisible();
  await expect(
    member.getByText("A private sketch of a garden gate"),
  ).toHaveCount(0);
  await expect(member.getByTestId("detail-image")).toHaveCount(0);
  await open(member, `/edit?from=${ownerImage}`);
  await expect(member.getByTestId("source-error")).toHaveText(
    "That image isn't available.",
  );
  await expect(member.getByTestId("source-preview")).toHaveCount(0);
  await open(member, `/?reuse=${ownerGeneration}`);
  await expect(member.getByTestId("prompt")).toHaveValue("");

  // The member's own requests, rewritten to name the owner's objects, are refused.
  await generate(member, { prompt: "A teapot on a windowsill", count: "1" });
  const [memberImage] = await shownImageIds(member);
  const memberGeneration = (
    await db
      .prepare("select id from generations where user_id = 'member'")
      .first()
  ).id;

  await open(member, `/edit?from=${memberImage}`);
  await member.route("**/_serverFn/**", (route) => {
    const body = route.request().postData() ?? "";
    route.continue(
      body.includes(memberImage)
        ? { postData: body.replaceAll(memberImage, ownerImage) }
        : {},
    );
  });
  await member.getByTestId("instruction").fill("Make it blue");
  await member.getByTestId("apply-edit").click();
  await expect(member.getByTestId("generation-error")).toHaveText(
    "That image isn't available.",
  );
  expect(
    (
      await db
        .prepare(
          "select count(*) as n from generations where user_id = 'member' and kind = 'edit'",
        )
        .first()
    ).n,
  ).toBe(0);
  await member.unroute("**/_serverFn/**");

  await open(member, `/history/${memberGeneration}`);
  await member.route("**/_serverFn/**", (route) => {
    const body = route.request().postData() ?? "";
    route.continue(
      body.includes(memberGeneration)
        ? { postData: body.replaceAll(memberGeneration, ownerGeneration) }
        : {},
    );
  });
  await member.getByTestId("delete-generation").click();
  await member
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(member).toHaveURL(/\/history$/);
  await member.unroute("**/_serverFn/**");
  expect(
    await db
      .prepare("select id from generations where id = ?")
      .bind(ownerGeneration)
      .first(),
  ).not.toBeNull();
  expect(
    (await runtime.fetch(`/api/images/${ownerImage}`, { role: "owner" }))
      .status,
  ).toBe(200);

  // F006 settings are admin-only: hidden from members, and a member's save is refused.
  await open(member, "/settings");
  await expect(member.getByTestId("admin-only")).toContainText(
    "Only admins can open settings",
  );
  await expect(member.getByTestId("daily-limit")).toHaveCount(0);
  await expect(member.getByRole("link", { name: "Settings" })).toHaveCount(0);

  await open(owner, "/settings");
  await expect(owner.getByRole("link", { name: "Settings" })).toBeVisible();
  await owner.getByTestId("daily-limit").fill("20");
  const [saveRequest] = await Promise.all([
    owner.waitForRequest(
      (request) =>
        request.url().includes("/_serverFn/") && request.method() === "POST",
    ),
    owner.getByTestId("save-limit").click(),
  ]);
  await expect(owner.getByText("Saved.")).toBeVisible();
  expect(
    (
      await db
        .prepare("select daily_image_limit as n from settings where id = 1")
        .first()
    ).n,
  ).toBe(20);
  const headers = Object.fromEntries(
    Object.entries(await saveRequest.allHeaders()).filter(
      ([name]) =>
        !["cookie", "host", "content-length"].includes(name) &&
        !name.startsWith(":"),
    ),
  );
  const refusal = await member.evaluate(
    async ({ url, headers, body }) =>
      (await fetch(url, { method: "POST", headers, body })).text(),
    {
      url: saveRequest.url(),
      headers,
      body: saveRequest.postData().replace("20", "999"),
    },
  );
  expect(refusal).toContain("Only admins can change this.");
  expect(
    (
      await db
        .prepare("select daily_image_limit as n from settings where id = 1")
        .first()
    ).n,
  ).toBe(20);

  // X001: the app serves no sign-in of its own.
  for (const path of [
    "/login",
    "/signin",
    "/sign-in",
    "/signup",
    "/register",
    "/logout",
    "/auth/login",
    "/account",
  ]) {
    const response = await runtime.fetch(path, { role: "member" });
    expect(response.status).toBe(404);
    expect(await response.text()).not.toMatch(/type="password"/);
  }
  const anonymousPage = await (await runtime.context(null)).newPage();
  const anonymous = await anonymousPage.goto("/");
  expect(anonymous.status()).not.toBe(200);
  await expect(anonymousPage.locator('input[type="password"]')).toHaveCount(0);
} finally {
  await runtime.close();
}

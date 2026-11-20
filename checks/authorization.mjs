// Authorization: the perimeter, private libraries and projects, roles, and no sign-in of the app's own.
import { start, expect, png, wav, upload, createProject } from "./lib.mjs";

const runtime = await start();
try {
  await runtime.assertPrivateAccess([
    "/",
    "/media",
    "/templates",
    "/voiceover",
  ]);
  for (const path of ["/api/media", "/api/transcribe"]) {
    for (const role of [undefined, "outsider"]) {
      const response = await runtime.fetch(path, {
        role,
        method: "POST",
        headers: { "content-type": "image/png" },
        body: png(8, 8),
      });
      expect(
        response.status,
        `${role ?? "anonymous"} POST ${path}`,
      ).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    }
  }

  // No sign-in, sign-up or password page of the app's own.
  for (const path of [
    "/login",
    "/signin",
    "/signup",
    "/auth/login",
    "/logout",
  ]) {
    const response = await runtime.fetch(path, { role: "member" });
    expect(response.status, path).toBe(404);
  }

  // Libraries are private, even from an admin.
  const ownerFile = await (
    await upload(runtime, "owner", {
      name: "owner-only.png",
      type: "image/png",
      body: png(32, 32),
      width: 32,
      height: 32,
    })
  ).json();
  const memberFile = await (
    await upload(runtime, "member", {
      name: "member-only.wav",
      type: "audio/wav",
      body: wav(1),
      durationMs: 1000,
    })
  ).json();
  expect(
    (await runtime.fetch(`/api/media/${ownerFile.id}/file`, { role: "member" }))
      .status,
  ).toBe(404);
  expect(
    (await runtime.fetch(`/api/media/${memberFile.id}/file`, { role: "owner" }))
      .status,
  ).toBe(404);
  expect(
    (
      await runtime.fetch(`/api/media/${memberFile.id}/file`, {
        role: "outsider",
      })
    ).status,
  ).toBeGreaterThanOrEqual(400);
  expect(
    (
      await runtime.fetch(`/api/media/${memberFile.id}/file`, {
        role: "member",
      })
    ).status,
  ).toBe(200);

  const memberPage = await (await runtime.context("member")).newPage();
  await memberPage.goto("/media");
  await expect(
    memberPage.getByTestId("media-row").filter({ hasText: "member-only.wav" }),
  ).toBeVisible();
  await expect(
    memberPage.getByTestId("media-row").filter({ hasText: "owner-only.png" }),
  ).toHaveCount(0);
  await expect(memberPage.locator('input[type="password"]')).toHaveCount(0);
  await memberPage.goto(`/photos/${ownerFile.id}`);
  await expect(memberPage.getByTestId("not-found")).toBeVisible();

  // Projects are private until shared.
  const page = await (await runtime.context("owner")).newPage();
  const projectId = await createProject(page, {
    name: "Board pitch",
    aspect: "16:9",
  });
  await page
    .getByTestId("library-item")
    .filter({ hasText: "owner-only.png" })
    .getByTestId("add-to-timeline")
    .click();
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  await memberPage.goto(`/projects/${projectId}`);
  await expect(memberPage.getByTestId("not-found")).toBeVisible();
  expect(
    (
      await runtime.fetch(`/api/projects/${projectId}/captions.srt`, {
        role: "member",
      })
    ).status,
  ).toBe(404);
  await memberPage.goto("/");
  await expect(
    memberPage.getByTestId("project-card").filter({ hasText: "Board pitch" }),
  ).toHaveCount(0);
  // A member can't export into a project they can't open.
  expect(
    (
      await upload(runtime, "member", {
        name: "x.webm",
        type: "video/webm",
        body: Buffer.from("1a45dfa3", "hex"),
        kind: "export",
        projectId,
      })
    ).status,
  ).toBe(404);

  // Shared as viewer: open and play, reach its media, nothing else.
  await memberPage.goto("/media"); // the member is known to the app
  await page.getByTestId("open-share").click();
  await page.getByTestId("share-email").fill("member@example.test");
  await page.getByTestId("share-role").click();
  await page.getByRole("option", { name: "Viewer", exact: true }).click();
  await page.getByTestId("share-submit").click();
  await expect(
    page.getByTestId("share-row").filter({ hasText: "member@example.test" }),
  ).toContainText("Viewer");
  await page.getByTestId("share-email").fill("nobody@example.test");
  await page.getByTestId("share-submit").click();
  await expect(page.getByTestId("share-error")).toBeVisible();
  await page.keyboard.press("Escape");

  await memberPage.goto(`/projects/${projectId}`);
  await expect(memberPage.getByTestId("view-only")).toBeVisible();
  await expect(memberPage.getByTestId("open-share")).toHaveCount(0);
  await expect(memberPage.getByTestId("open-publish")).toHaveCount(0);
  await expect(memberPage.getByTestId("open-export")).toHaveCount(0);
  await expect(memberPage.getByTestId("add-text")).toHaveCount(0);
  expect(
    (await runtime.fetch(`/api/media/${ownerFile.id}/file`, { role: "member" }))
      .status,
  ).toBe(200);
  expect(
    (
      await runtime.fetch(`/api/projects/${projectId}/captions.srt`, {
        role: "member",
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await upload(runtime, "member", {
        name: "x.webm",
        type: "video/webm",
        body: Buffer.from("1a45dfa3", "hex"),
        kind: "export",
        projectId,
      })
    ).status,
  ).toBe(403);
  await memberPage.goto("/");
  const card = memberPage
    .getByTestId("project-card")
    .filter({ hasText: "Board pitch" });
  await expect(card).toContainText("Viewer");
  await card.getByTestId("project-actions").click();
  await expect(
    memberPage.getByRole("menuitem", { name: "Delete" }),
  ).toHaveCount(0);
  await expect(
    memberPage.getByRole("menuitem", { name: "Rename" }),
  ).toHaveCount(0);
  await memberPage.keyboard.press("Escape");

  // Revoked: gone again.
  await page.getByTestId("open-share").click();
  await page
    .getByTestId("share-row")
    .filter({ hasText: "member@example.test" })
    .getByTestId("share-revoke")
    .click();
  await expect(page.getByTestId("share-row")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await memberPage.goto(`/projects/${projectId}`);
  await expect(memberPage.getByTestId("not-found")).toBeVisible();
  expect(
    (await runtime.fetch(`/api/media/${ownerFile.id}/file`, { role: "member" }))
      .status,
  ).toBe(404);

  // Templates: the author or an admin deletes; another member can't.
  const memberProject = await createProject(memberPage, {
    name: "Member layout",
    aspect: "1:1",
  });
  await memberPage.getByTestId("add-text").click();
  await memberPage.getByTestId("text-content").fill("Hello from the team");
  await expect(memberPage.getByTestId("save-status")).toHaveText("Saved");
  await memberPage.getByTestId("open-publish").click();
  await memberPage.getByTestId("template-title").fill("Member square layout");
  await memberPage.getByTestId("publish-submit").click();
  await expect(memberPage.getByTestId("published")).toBeVisible();
  await page.getByTestId("open-publish").click();
  await page.getByTestId("template-title").fill("Owner wide layout");
  await page.getByTestId("publish-submit").click();
  await expect(page.getByTestId("published")).toBeVisible();

  await memberPage.goto("/templates");
  await expect(
    memberPage
      .getByTestId("template-card")
      .filter({ hasText: "Owner wide layout" })
      .getByTestId("delete-template"),
  ).toHaveCount(0);
  await expect(
    memberPage
      .getByTestId("template-card")
      .filter({ hasText: "Built in" })
      .first()
      .getByTestId("delete-template"),
  ).toHaveCount(0);
  await expect(
    memberPage
      .getByTestId("template-card")
      .filter({ hasText: "Member square layout" })
      .getByTestId("delete-template"),
  ).toHaveCount(1);
  // A template's media is readable by members so they can start from it.
  expect(
    (await runtime.fetch(`/api/media/${ownerFile.id}/file`, { role: "member" }))
      .status,
  ).toBe(200);

  await page.goto("/templates");
  const memberTemplate = page
    .getByTestId("template-card")
    .filter({ hasText: "Member square layout" });
  await memberTemplate.getByTestId("delete-template").click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(memberTemplate).toHaveCount(0);
  expect(memberProject).toBeTruthy();

  // Voiceovers are private to their creator.
  await memberPage.goto("/voiceover");
  await memberPage
    .getByTestId("voiceover-text")
    .fill("Notes for the team call.");
  await memberPage.getByTestId("generate-voiceover").click();
  await expect(memberPage.getByTestId("voiceover-row").first()).toContainText(
    "Notes for the team call",
  );
  await page.goto("/voiceover");
  await expect(
    page
      .getByTestId("voiceover-row")
      .filter({ hasText: "Notes for the team call" }),
  ).toHaveCount(0);
  await page.goto("/media");
  await expect(
    page
      .getByTestId("media-row")
      .filter({ hasText: "Notes for the team call" }),
  ).toHaveCount(0);

  // Speech-to-text answers only members, with bounded input.
  const transcribed = await runtime.fetch("/api/transcribe", {
    role: "member",
    method: "POST",
    headers: { "content-type": "audio/wav" },
    body: wav(1),
  });
  expect(transcribed.status).toBe(200);
  expect((await transcribed.json()).segments.length).toBeGreaterThan(0);
  console.log("authorization: ok");
} finally {
  await runtime.close();
}

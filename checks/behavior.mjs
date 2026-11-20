// Behavior: every frozen feature's main path, through the packaged release.
import {
  start,
  expect,
  png,
  wav,
  upload,
  choose,
  createProject,
} from "./lib.mjs";

const runtime = await start();
try {
  await runtime.assertPrivateAccess([
    "/",
    "/media",
    "/templates",
    "/voiceover",
  ]);

  // F001 request level: upload, stream with ranges, refuse bad types.
  const lake = png(320, 180);
  const created = await upload(runtime, "owner", {
    name: "lake-sunrise.png",
    type: "image/png",
    body: lake,
    width: 320,
    height: 180,
  });
  expect(created.status).toBe(201);
  const { id: lakeId } = await created.json();
  const file = await runtime.fetch(`/api/media/${lakeId}/file`, {
    role: "owner",
  });
  expect(file.status).toBe(200);
  expect(file.headers.get("content-type")).toBe("image/png");
  expect(Buffer.from(await file.arrayBuffer()).equals(lake)).toBe(true);
  const ranged = await runtime.fetch(`/api/media/${lakeId}/file`, {
    role: "owner",
    headers: { range: "bytes=0-7" },
  });
  expect(ranged.status).toBe(206);
  expect((await ranged.arrayBuffer()).byteLength).toBe(8);
  expect(
    (
      await upload(runtime, "owner", {
        name: "notes.txt",
        type: "text/plain",
        body: "hi",
      })
    ).status,
  ).toBe(415);

  // Member visits once so the owner can share with them later.
  const memberContext = await runtime.context("member");
  const memberPage = await memberContext.newPage();
  await memberPage.goto("/");
  await expect(
    memberPage.getByRole("heading", { name: "Projects" }),
  ).toBeVisible();

  const owner = await runtime.context("owner");
  const page = await owner.newPage();

  // F001 in the browser: upload, list, filter, rename, preview, delete.
  await page.goto("/media");
  await runtime.assertBackLink(page);
  await expect(
    page.getByTestId("media-row").filter({ hasText: "lake-sunrise.png" }),
  ).toBeVisible();
  await page.getByTestId("media-upload-input").setInputFiles([
    { name: "trail-narration.wav", mimeType: "audio/wav", buffer: wav(2.5) },
    { name: "old-draft.png", mimeType: "image/png", buffer: png(64, 64) },
  ]);
  const narrationRow = page
    .getByTestId("media-row")
    .filter({ hasText: "trail-narration.wav" });
  await expect(narrationRow).toBeVisible();
  await expect(narrationRow).toContainText("Audio");
  await expect(narrationRow).toContainText("0:02");
  const lakeRow = page
    .getByTestId("media-row")
    .filter({ hasText: "lake-sunrise.png" });
  await expect(lakeRow).toContainText("320 × 180");
  await expect(page.getByTestId("media-row")).toHaveCount(3);
  await page.getByTestId("filter-audio").click();
  await expect(page.getByTestId("media-row")).toHaveCount(1);
  await page.getByTestId("filter-all").click();
  await expect(page.getByTestId("media-row")).toHaveCount(3);

  await lakeRow.getByTestId("media-actions").click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByTestId("rename-input").fill("Lakeside sunrise");
  await page.getByTestId("rename-save").click();
  const renamedRow = page
    .getByTestId("media-row")
    .filter({ hasText: "Lakeside sunrise" });
  await expect(renamedRow).toBeVisible();

  await renamedRow.getByTestId("media-actions").click();
  await page.getByRole("menuitem", { name: "Preview" }).click();
  await expect(page.getByTestId("media-preview").locator("img")).toBeVisible();
  await page.keyboard.press("Escape");

  const draftRow = page
    .getByTestId("media-row")
    .filter({ hasText: "old-draft.png" });
  await draftRow.getByTestId("media-actions").click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByTestId("media-row")).toHaveCount(2);

  // F006: a voiceover lands in the library.
  await page.goto("/voiceover");
  await page
    .getByTestId("voiceover-text")
    .fill("Welcome back to the trail. Today we hike to the lake at sunrise.");
  await choose(page, "voice-select", "Spanish");
  await page.getByTestId("generate-voiceover").click();
  const voiceRow = page.getByTestId("voiceover-row").first();
  await expect(voiceRow).toContainText("Welcome back to the trail");
  await expect(voiceRow.locator("audio")).toHaveCount(1);
  await expect(page.getByTestId("voiceover-text")).toHaveAttribute(
    "maxlength",
    "2000",
  );

  // F007: the photo editor saves a new image and leaves the original alone.
  await page.goto("/media");
  await renamedRow.getByTestId("media-actions").click();
  await Promise.all([
    page.waitForURL(/\/photos\//),
    page.getByRole("menuitem", { name: "Edit photo" }).click(),
  ]);
  await expect(page.getByTestId("photo-canvas")).toBeVisible();
  await page.getByTestId("crop-1x1").click();
  await page.getByTestId("rotate-right").click();
  await page.getByTestId("flip-h").click();
  await choose(page, "photo-filter", "Warm");
  await page.getByTestId("resize-width").fill("400");
  await expect(page.getByTestId("resize-height")).toHaveValue("400");
  await page.getByTestId("add-photo-text").click();
  await page.getByTestId("photo-text-input").fill("Morning hike");
  await page.getByTestId("photo-format-webp").click();
  await page.getByTestId("photo-name").fill("Lakeside square");
  await page.getByTestId("save-photo").click();
  await expect(page.getByTestId("photo-saved")).toBeVisible();
  await page.goto("/media");
  const squareRow = page
    .getByTestId("media-row")
    .filter({ hasText: "Lakeside square" });
  await expect(squareRow).toContainText("400 × 400");
  await expect(squareRow).toContainText("Image");
  await expect(
    page.getByTestId("media-row").filter({ hasText: "Lakeside sunrise" }),
  ).toContainText("320 × 180");

  // F002: a vertical project, blank.
  const projectId = await createProject(page, {
    name: "Weekend hike recap",
    aspect: "9:16",
  });
  await expect(page.getByTestId("project-title")).toHaveText(
    "Weekend hike recap",
  );

  // F003: build the timeline.
  const library = page.getByTestId("library-item");
  await library
    .filter({ hasText: "Lakeside sunrise" })
    .getByTestId("add-to-timeline")
    .click();
  await library
    .filter({ hasText: "Lakeside square" })
    .getByTestId("add-to-timeline")
    .click();
  await library
    .filter({ hasText: "trail-narration.wav" })
    .getByTestId("add-to-timeline")
    .click();
  await expect(
    page.getByTestId("track-visual").getByTestId("timeline-item"),
  ).toHaveCount(2);
  await expect(
    page.getByTestId("track-audio").getByTestId("timeline-item"),
  ).toHaveCount(1);

  // Edit the first image: mirror, filter, fade, crossfade into the next one.
  await page
    .getByTestId("track-visual")
    .getByTestId("timeline-item")
    .first()
    .click();
  await page.getByTestId("mirror").click();
  await choose(page, "filter-select", "Vivid");
  await page.getByTestId("item-duration").fill("2");
  await page.getByTestId("item-duration").blur();
  await page
    .getByTestId("track-visual")
    .getByTestId("timeline-item")
    .nth(1)
    .click();
  await page.getByTestId("transition-crossfade").click();
  // Split the second image at the playhead, then delete the tail.
  await page.getByTestId("seek-input").fill("3");
  await page.getByTestId("seek-input").blur();
  await page.getByTestId("split").click();
  await expect(
    page.getByTestId("track-visual").getByTestId("timeline-item"),
  ).toHaveCount(3);
  await page.getByTestId("delete-item").click();
  await expect(
    page.getByTestId("track-visual").getByTestId("timeline-item"),
  ).toHaveCount(2);
  // Move it before the first.
  await page
    .getByTestId("track-visual")
    .getByTestId("timeline-item")
    .nth(1)
    .click();
  await page.getByTestId("move-earlier").click();
  // Audio: volume and fade out.
  await page.getByTestId("track-audio").getByTestId("timeline-item").click();
  await page.getByTestId("item-volume").fill("80");
  await page.getByTestId("item-volume").blur();
  await page.getByTestId("item-fade-out").fill("0.5");
  await page.getByTestId("item-fade-out").blur();
  // A styled text overlay from the start.
  await page.getByTestId("seek-input").fill("0");
  await page.getByTestId("seek-input").blur();
  await page.getByTestId("add-text").click();
  await page.getByTestId("text-content").fill("Day one at the lake");
  await page.getByTestId("text-end").fill("3");
  await page.getByTestId("text-end").blur();
  await expect(
    page.getByTestId("track-text").getByTestId("timeline-item"),
  ).toContainText("Day one at the lake");
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  await page.getByTestId("play").click();
  await expect(page.getByTestId("play")).toHaveAccessibleName("Pause");
  await page.getByTestId("play").click();

  // F005: captions by hand and from speech.
  await page.getByTestId("tab-captions").click();
  await page.getByTestId("add-caption").click();
  await page
    .getByTestId("caption-text")
    .first()
    .fill("We started before sunrise");
  await choose(page, "caption-clip", "trail-narration.wav");
  await page.getByTestId("generate-captions").click();
  await expect(page.getByTestId("caption-line")).toHaveCount(3);
  await expect(
    page
      .getByTestId("caption-line")
      .filter({ has: page.locator('input[value="Welcome to the lake."]') }),
  ).toHaveCount(1);
  await choose(page, "caption-style", "Boxed");
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  const srt = await runtime.fetch(`/api/projects/${projectId}/captions.srt`, {
    role: "owner",
  });
  expect(srt.status).toBe(200);
  const srtText = await srt.text();
  expect(srtText).toContain("Welcome to the lake.");
  expect(srtText).toMatch(/00:00:0\d,\d{3} --> 00:00:0\d,\d{3}/);

  // Reload: autosaved.
  await page.reload();
  await expect(
    page.getByTestId("track-text").getByTestId("timeline-item"),
  ).toContainText("Day one at the lake");
  await expect(
    page.getByTestId("track-visual").getByTestId("timeline-item"),
  ).toHaveCount(2);

  // F004: export in the browser; it downloads and lands in the library and export list.
  await page.getByTestId("open-export").click();
  await page.getByTestId("export-name").fill("hike-recap");
  await page.getByTestId("export-resolution-480").click();
  await page.getByTestId("export-fps-24").click();
  await page.getByTestId("export-format-webm").click();
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 60000 }),
    page.getByTestId("start-export").click(),
  ]);
  expect(download.suggestedFilename()).toBe("hike-recap.webm");
  await expect(
    page.getByTestId("export-row").filter({ hasText: "hike-recap.webm" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  // F002: share with a member as editor; it appears in their list.
  await page.getByTestId("open-share").click();
  await page.getByTestId("share-email").fill("member@example.test");
  await page.getByTestId("share-submit").click();
  await expect(
    page.getByTestId("share-row").filter({ hasText: "member@example.test" }),
  ).toContainText("Editor");
  await page.keyboard.press("Escape");
  await memberPage.goto("/");
  const sharedCard = memberPage
    .getByTestId("project-card")
    .filter({ hasText: "Weekend hike recap" });
  await expect(sharedCard).toContainText("Editor");

  // F003: a stale save is reported, not written over.
  await memberPage.goto(`/projects/${projectId}`);
  await memberPage
    .getByTestId("track-text")
    .getByTestId("timeline-item")
    .click();
  await memberPage
    .getByTestId("text-content")
    .fill("Day one at the lake, together");
  await expect(memberPage.getByTestId("save-status")).toHaveText("Saved");
  await page.getByTestId("track-text").getByTestId("timeline-item").click();
  await page.getByTestId("text-content").fill("Day one");
  await expect(page.getByTestId("save-conflict")).toBeVisible();
  await page.reload();
  await expect(
    page.getByTestId("track-text").getByTestId("timeline-item"),
  ).toContainText("Day one at the lake, together");

  // Viewer: play, no editing.
  await page.getByTestId("open-share").click();
  await choose(page, "share-role-member@example.test", "Viewer");
  await expect(
    page.getByTestId("share-row").filter({ hasText: "member@example.test" }),
  ).toContainText("Viewer");
  await page.keyboard.press("Escape");
  await memberPage.reload();
  await expect(memberPage.getByTestId("view-only")).toBeVisible();
  await expect(memberPage.getByTestId("play")).toBeVisible();
  await expect(memberPage.getByTestId("add-text")).toHaveCount(0);
  await expect(memberPage.getByTestId("add-to-timeline")).toHaveCount(0);

  // F002: publish as a template; another member starts from it.
  await page.getByTestId("open-publish").click();
  await page.getByTestId("template-title").fill("Hike recap, vertical");
  await page.getByTestId("publish-submit").click();
  await expect(page.getByTestId("published")).toBeVisible();
  await memberPage.goto("/templates");
  const templateCard = memberPage
    .getByTestId("template-card")
    .filter({ hasText: "Hike recap, vertical" });
  await expect(templateCard).toBeVisible();
  await expect(templateCard.getByTestId("delete-template")).toHaveCount(0);
  await expect(
    memberPage
      .getByTestId("template-card")
      .filter({ hasText: "Built in" })
      .first(),
  ).toBeVisible();
  await createProject(memberPage, {
    name: "My lake trip",
    aspect: "9:16",
    template: "Hike recap, vertical",
  });
  await expect(
    memberPage.getByTestId("track-visual").getByTestId("timeline-item"),
  ).toHaveCount(2);
  await expect(
    memberPage.getByTestId("track-text").getByTestId("timeline-item"),
  ).toContainText("Day one at the lake, together");

  // Rename, duplicate and delete from the list.
  await memberPage.goto("/");
  const mine = memberPage
    .getByTestId("project-card")
    .filter({ hasText: "My lake trip" });
  await mine.getByTestId("project-actions").click();
  await memberPage.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(
    memberPage
      .getByTestId("project-card")
      .filter({ hasText: "My lake trip (copy)" }),
  ).toBeVisible();
  const copy = memberPage
    .getByTestId("project-card")
    .filter({ hasText: "My lake trip (copy)" });
  await copy.getByTestId("project-actions").click();
  await memberPage.getByRole("menuitem", { name: "Rename" }).click();
  await memberPage.getByTestId("rename-input").fill("Lake trip, short cut");
  await memberPage.getByTestId("rename-save").click();
  const renamed = memberPage
    .getByTestId("project-card")
    .filter({ hasText: "Lake trip, short cut" });
  await expect(renamed).toBeVisible();
  await renamed.getByTestId("project-actions").click();
  await memberPage.getByRole("menuitem", { name: "Delete" }).click();
  await memberPage.getByRole("button", { name: "Delete" }).click();
  await expect(renamed).toHaveCount(0);

  // The author removes their template.
  await page.goto("/templates");
  const ownTemplate = page
    .getByTestId("template-card")
    .filter({ hasText: "Hike recap, vertical" });
  await ownTemplate.getByTestId("delete-template").click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(ownTemplate).toHaveCount(0);

  // Exports landed in the library.
  await page.goto("/media");
  await expect(
    page.getByTestId("media-row").filter({ hasText: "hike-recap.webm" }),
  ).toContainText("Video");

  // Phone-sized smoke.
  const phone = await runtime.context("member", {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const phonePage = await phone.newPage();
  await phonePage.goto("/");
  await expect(
    phonePage.getByRole("heading", { name: "Projects" }),
  ).toBeVisible();
  await expect(phonePage.getByTestId("new-project")).toBeVisible();
  await phonePage.goto(`/projects/${projectId}`);
  await expect(phonePage.getByTestId("play")).toBeVisible();

  // The public picture: the editor with the finished timeline.
  await page.goto(`/projects/${projectId}`);
  await page.getByTestId("seek-input").fill("1");
  await page.getByTestId("seek-input").blur();
  await page
    .getByTestId("track-visual")
    .getByTestId("timeline-item")
    .first()
    .click();
  await expect(page.getByTestId("filter-select")).toBeVisible();
  await expect(
    page.getByTestId("track-text").getByTestId("timeline-item"),
  ).toBeVisible();
  await runtime.screenshot(page);
  console.log("behavior: ok");
} finally {
  await runtime.close();
}

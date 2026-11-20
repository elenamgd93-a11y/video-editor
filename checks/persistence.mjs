// Persistence: media, projects and shares survive a restart.
import { start, expect, png, upload, createProject } from "./lib.mjs";

const runtime = await start();
try {
  const image = png(120, 90);
  const { id } = await (
    await upload(runtime, "owner", {
      name: "harbor-dusk.png",
      type: "image/png",
      body: image,
      width: 120,
      height: 90,
    })
  ).json();
  const page = await (await runtime.context("owner")).newPage();
  const projectId = await createProject(page, {
    name: "Harbor evening",
    aspect: "4:5",
  });
  await page
    .getByTestId("library-item")
    .filter({ hasText: "harbor-dusk.png" })
    .getByTestId("add-to-timeline")
    .click();
  await page.getByTestId("add-text").click();
  await page.getByTestId("text-content").fill("Boats coming home");
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  await page.close();

  await runtime.restart();

  const file = await runtime.fetch(`/api/media/${id}/file`, { role: "owner" });
  expect(file.status).toBe(200);
  expect(Buffer.from(await file.arrayBuffer()).equals(image)).toBe(true);
  const again = await (await runtime.context("owner")).newPage();
  await again.goto("/");
  await expect(
    again.getByTestId("project-card").filter({ hasText: "Harbor evening" }),
  ).toContainText("4:5");
  await again.goto(`/projects/${projectId}`);
  await expect(
    again.getByTestId("track-visual").getByTestId("timeline-item"),
  ).toHaveCount(1);
  await expect(
    again.getByTestId("track-text").getByTestId("timeline-item"),
  ).toContainText("Boats coming home");
  await again.goto("/media");
  await expect(
    again.getByTestId("media-row").filter({ hasText: "harbor-dusk.png" }),
  ).toContainText("120 × 90");
  console.log("persistence: ok");
} finally {
  await runtime.close();
}

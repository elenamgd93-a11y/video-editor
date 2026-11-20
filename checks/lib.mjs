// Shared helpers for the release checks: a local stand-in for the Workers AI
// binding (speech-to-text and text-to-speech) and small generated media files.
import zlib from "node:zlib";
import {
  startRuntime,
  expect,
} from "/home/user/oss-new/control/runtime/index.mjs";

export { expect };

/** A WAV file: `seconds` of a soft tone, 16-bit mono. */
export function wav(seconds = 2, rate = 16000, freq = 220) {
  const samples = Math.round(seconds * rate);
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    buffer.writeInt16LE(
      Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * 6000),
      44 + i * 2,
    );
  }
  return buffer;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A PNG landscape: sky gradient over a lake, with a sun. */
export function png(width = 320, height = 180) {
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x++) {
      const t = y / height;
      let [r, g, b] =
        t < 0.55
          ? [250 - t * 200, 170 + t * 60, 90 + t * 250]
          : [40, 90 + (1 - t) * 80, 140];
      const dx = x - width * 0.68,
        dy = y - height * 0.42;
      if (dx * dx + dy * dy < (height * 0.12) ** 2) [r, g, b] = [255, 220, 120];
      row[1 + x * 3] = r;
      row[2 + x * 3] = g;
      row[3 + x * 3] = b;
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// A local fake of the Workers AI binding: env.AI.run(model, input) reaches
// this entrypoint's run() over RPC. It records each call for assertions.
const FAKE_AI = `import { WorkerEntrypoint } from "cloudflare:workers";
const SPEECH = ${JSON.stringify(wav(1.5, 16000, 330).toString("base64"))};
export default class extends WorkerEntrypoint {
  async run(model, input) {
    if (model.includes("whisper")) {
      if (typeof input.audio !== "string" || input.audio.length < 100) throw new Error("no audio");
      return { text: "Welcome to the lake. We set off at dawn.", segments: [
        { start: 0, end: 0.9, text: " Welcome to the lake." },
        { start: 0.9, end: 1.8, text: " We set off at dawn." } ] };
    }
    if (model.includes("melotts")) {
      if (!input.prompt || input.prompt.length > 2000) throw new Error("bad prompt");
      return { audio: SPEECH };
    }
    throw new Error("unknown model " + model);
  }
  async fetch() { return new Response("fake ai"); }
}`;

export async function start(options = {}) {
  return startRuntime({
    ...options,
    bindings: {
      AI: { type: "worker", worker: "fake-ai" },
      ...(options.bindings ?? {}),
    },
    workers: [
      {
        config: {
          name: "fake-ai",
          compatibilityDate: "2025-09-01",
          manifest: {
            mainModule: "ai.mjs",
            modules: { "ai.mjs": { type: "esm", contents: FAKE_AI } },
          },
        },
      },
      ...(options.workers ?? []),
    ],
  });
}

/** Upload bytes straight to the media endpoint as `role`. */
export async function upload(
  runtime,
  role,
  { name, type, body, kind, width, height, durationMs, projectId },
) {
  const headers = {
    "content-type": type,
    "x-file-name": encodeURIComponent(name),
  };
  if (width) headers["x-media-width"] = String(width);
  if (height) headers["x-media-height"] = String(height);
  if (durationMs) headers["x-media-duration"] = String(durationMs);
  const query = new URLSearchParams();
  if (kind) query.set("source", kind);
  if (projectId) query.set("projectId", projectId);
  return runtime.fetch(`/api/media${query.size ? `?${query}` : ""}`, {
    role,
    method: "POST",
    headers,
    body,
  });
}

/** Pick an option of a Base UI select by its trigger's test id. */
export async function choose(page, testId, option) {
  await page.getByTestId(testId).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

/** Create a project from the projects page; resolves on the editor. */
export async function createProject(page, { name, aspect = "16:9", template }) {
  await page.goto("/");
  await page.getByTestId("new-project").click();
  await page.getByTestId("project-name").fill(name);
  await page.getByTestId(`aspect-${aspect.replace(":", "x")}`).click();
  if (template) await choose(page, "template-select", template);
  await Promise.all([
    page.waitForURL(/\/projects\/[^/]+$/),
    page.getByTestId("create-project").click(),
  ]);
  await expect(page.getByTestId("editor")).toBeVisible();
  return new URL(page.url()).pathname.split("/").pop();
}

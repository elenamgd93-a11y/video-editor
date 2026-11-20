export type MediaKind = "video" | "audio" | "image";

export interface Probed {
  durationMs?: number;
  width?: number;
  height?: number;
}

export function kindOf(mime: string): MediaKind | null {
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "image";
  return null;
}

/** Read a file's length or size in the browser, the way it will play. */
export function probe(source: Blob | string, kind: MediaKind): Promise<Probed> {
  const url = typeof source === "string" ? source : URL.createObjectURL(source);
  const done = () => {
    if (typeof source !== "string") URL.revokeObjectURL(url);
  };
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      done();
      resolve({});
    }, 8000);
    const finish = (value: Probed) => {
      clearTimeout(timer);
      done();
      resolve(value);
    };
    if (kind === "image") {
      const img = new Image();
      img.onload = () =>
        finish({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => finish({});
      img.src = url;
      return;
    }
    const el = document.createElement(kind === "video" ? "video" : "audio");
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      const read = () => {
        const duration = Number.isFinite(el.duration)
          ? Math.round(el.duration * 1000)
          : undefined;
        const video = el as HTMLVideoElement;
        finish({
          durationMs: duration,
          width: kind === "video" ? video.videoWidth || undefined : undefined,
          height: kind === "video" ? video.videoHeight || undefined : undefined,
        });
      };
      if (!Number.isFinite(el.duration)) {
        // Recorded WebM files report no length until the end is reached.
        el.ontimeupdate = () => {
          el.ontimeupdate = null;
          el.currentTime = 0;
          read();
        };
        el.currentTime = 1e9;
      } else read();
    };
    el.onerror = () => finish({});
    el.src = url;
  });
}

export interface UploadOptions {
  name?: string;
  source?: "upload" | "export" | "photo";
  projectId?: string;
  settings?: Record<string, unknown>;
  probed?: Probed;
}

export async function uploadFile(
  file: Blob & { name?: string },
  options: UploadOptions = {},
) {
  const mime = file.type || "application/octet-stream";
  const kind = kindOf(mime);
  const probed = options.probed ?? (kind ? await probe(file, kind) : {});
  const headers: Record<string, string> = {
    "content-type": mime,
    "x-file-name": encodeURIComponent(options.name ?? file.name ?? "Untitled"),
  };
  if (probed.durationMs)
    headers["x-media-duration"] = String(probed.durationMs);
  if (probed.width) headers["x-media-width"] = String(probed.width);
  if (probed.height) headers["x-media-height"] = String(probed.height);
  const query = new URLSearchParams();
  if (options.source && options.source !== "upload")
    query.set("source", options.source);
  if (options.projectId) query.set("projectId", options.projectId);
  if (options.settings) query.set("settings", JSON.stringify(options.settings));
  const response = await fetch(`/api/media${query.size ? `?${query}` : ""}`, {
    method: "POST",
    headers,
    body: file,
  });
  const body = (await response.json().catch(() => ({}))) as {
    id?: string;
    error?: string;
  };
  if (!response.ok || !body.id)
    throw new Error(body.error ?? "The upload failed. Try again.");
  return body.id;
}

export const fileUrl = (id: string) => `/api/media/${id}/file`;

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

export function formatDate(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

export const KIND_LABELS: Record<MediaKind, string> = {
  video: "Video",
  audio: "Audio",
  image: "Image",
};

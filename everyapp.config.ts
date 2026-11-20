import { defineEveryApp } from "@every-app/sdk";

export default defineEveryApp({
  id: "video-editor",
  name: "Video Editor",
  description:
    "Edit videos and photos in the browser, with a cloud media library, captions, voiceovers and project templates.",
  access: "everyone",
  resources: {
    d1: ["DB"],
    r2: ["files"],
    ai: ["AI"],
  },
});

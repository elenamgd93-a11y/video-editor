# Video Editor

Edit videos and photos in the browser: arrange clips, text and captions on a timeline, add generated voiceovers, and export finished videos to a cloud media library.

Inspired by https://capcut.com

Built with [oss.new](https://oss.new) for [EveryApp](https://github.com/every-app/every-app).

## Features

- Upload video, audio and images to a private library, then filter, preview, rename, download and delete them.
- Create landscape, vertical, square or portrait projects, blank or from a template, and rename, duplicate, delete, share or publish them as templates.
- Edit on a multi-track timeline: trim, split, reorder, crop, position, mirror, reverse, speed, volume, fades, crossfades, colour filters and styled text.
- Export the timeline in the browser as WebM or MP4 at 480p, 720p or 1080p and 24, 30 or 60 fps.
- Write captions by hand or generate them from a clip's speech, style them, and download them as .srt.
- Turn up to 2,000 characters of text into a voiceover in one of six languages.
- Crop, rotate, flip, resize, adjust, filter and add text to photos, saving a new PNG, JPEG or WebP.

Left out: accounts and sign-in, which your Gateway handles; desktop and mobile apps; AI generation and cleanup tools; stock music, sticker and effect catalogues; plans and billing; brand kits; cloud-drive imports and posting to social networks.

## Setup

```sh
pnpm install
pnpm dev          # run locally behind a local Gateway
pnpm test         # unit tests
pnpm run deploy   # deploy to your Cloudflare account through your Gateway
```

There are no secrets or settings. The app uses a D1 database, an R2 bucket (`files`) and the account's Workers AI binding (`AI`) for speech-to-text and text-to-speech; the deploy creates or binds them. R2 has to be turned on once in the Cloudflare account.

The release checks in `checks/` run against a packaged build with a local stand-in for Workers AI. Real Workers AI calls and real deployment aren't covered by them.

## Limitations

- Exports render in real time in the open tab, so a 2-minute video takes about 2 minutes. MP4 is offered only where the browser can record it.
- Uploads are limited to 95 MB per file.
- Automatic captions work on up to five minutes of a clip at a time.
- Reversed clips play by seeking frame by frame, so they look choppy in preview and are silent.
- Workers AI usage for captions and voiceovers is billed to your Cloudflare account.
- To share a project, the other member must have opened the app once.

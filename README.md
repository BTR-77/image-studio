# Image Studio

Image Studio makes pictures from a written description and changes existing pictures when you say what to change. Each member keeps a private history of what they made.

Inspired by https://raphael.app

Built with [oss.new](https://oss.new) for [EveryApp](https://github.com/every-app/every-app).

## Features

- Create 1 to 4 images from a prompt, with an aspect ratio and a style, and download them.
- Rewrite a short idea into a detailed prompt with AI, and undo it.
- Steer a creation with up to 4 reference images.
- Edit an uploaded or past image by describing the change.
- Browse, reopen, reuse, edit from and delete your own past runs.
- Stay within a daily image limit per member that an admin sets.

Left out: accounts and sign-in, which your Gateway handles; plans, credits and watermarks; video; specialised tools such as upscaling or background removal; a choice of models, resolutions and formats; templates and a public gallery; a developer API.

## Setup

- Install: `pnpm install`.
- Run: `pnpm dev`. Workers AI is remote even in development, so image and prompt requests use your Cloudflare account.
- Test: `pnpm test` for unit tests. The suites in `checks/` run against a packaged release in the oss.new runtime, with a local stand-in for Workers AI.
- Deploy: `pnpm run deploy`. The deploy creates the D1 database and the R2 bucket and binds Workers AI. Every member of the workspace can open the app.

There are no secrets or settings to set. The daily limit (50 images by default) is changed by an admin on the app's Settings page.

## Limitations

- Image creation, prompt rewriting and edits run on Workers AI and are billed to the Cloudflare account the app is deployed to. R2 must be enabled on that account.
- Requests to the real models were not exercised in local acceptance; the suites use a stand-in.
- A run happens while the page waits. Closing the page during a run can leave it marked as running in history.
- The daily limit counts images per member per UTC day; failed images don't count.

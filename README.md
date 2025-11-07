# CritKey

Fast rubric grading app with keyboard shortcuts for Canvas LMS.

## Features

- Import Canvas-formatted rubric CSVs
- Keyboard-driven grading workflow
- Auto-copy feedback to clipboard
- Save feedback history (last 5)
- Persistent storage by course
- Compact, efficient UI

## Development

```bash
npm install
npm run dev
```

## Building

```bash
npm run build
```

## Cloudflare Pages Deployment

When deploying to Cloudflare Pages, use these settings:

- **Root directory:** `/` (root of repository)
- **Build command:** `npm run build`
- **Build output directory:** `rubric-grader/dist`
- **Node version:** 18 or higher

The root `package.json` will automatically handle building the app from the `rubric-grader` subdirectory.


# HTML to PDF Frontend

A web app for converting HTML to PDF documents. Paste code or upload an HTML file, preview it live, configure page options, and download the result as a PDF.

Built with [SvelteKit 5](https://svelte.dev/) and deployed on [Netlify](https://www.netlify.com/). Uses the [html-to-pdf-rust-api](https://github.com/polyym/html-to-pdf-rust-api) backend for rendering.

## Features

- **Editor**: Monospace code input with drag-and-drop or file picker upload (.html/.htm)
- **Live preview**: Sandboxed iframe preview of your HTML, debounced for performance
- **PDF options**: Orientation, page size (A0–A6, Letter, Legal, Tabloid, Ledger), scale (0.1–2.0), print/omit background
- **Smart status**: Real-time API health indicator with version and render slot availability on hover
- **Rate limit handling**: Countdown timer on the download button, synced with the server's cooldown state
- **Validation**: Client-side checks for empty content, file size (5MB), scale range, and empty files before sending
- **Error feedback**: Distinct messages for validation errors, payload limits, rate limiting, capacity, and timeouts
- **Keyboard shortcuts**: `Ctrl+Enter` / `⌘+Enter` to download, double `Esc` to clear
- **Accessible**: ARIA roles, labels, toggle states, focus indicators, and a screen-reader live region for loading state
- **Responsive**: Mobile, tablet, landscape, and notched-device support with safe area insets

## Project Structure

```
src/
├── lib/
│   ├── api.ts          # API client: health checks, PDF generation, blob download
│   └── files.ts        # File utilities: validation, reading, drag-and-drop
├── routes/
│   ├── +layout.svelte  # Shell layout with SEO meta tags
│   ├── +error.svelte   # Branded error page for unexpected failures
│   └── +page.svelte    # Main page: state, UI, and styles
└── app.html            # HTML shell: fonts, favicon, theme colour
_headers                # Netlify security headers
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v22+
- The [html-to-pdf-rust-api](https://github.com/polyym/html-to-pdf-rust-api) backend running locally (requires Rust and Chrome/Chromium: see the [backend README](https://github.com/polyym/html-to-pdf-rust-api#readme))

### Setup

```bash
git clone https://github.com/polyym/html-to-pdf-frontend.git
cd html-to-pdf-frontend
npm install
npm run dev
```

The app starts on `http://localhost:5173` and connects to the backend at `http://localhost:3001` by default.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PUBLIC_API_URL` | `http://localhost:3001` | Backend API URL |

For local development, the default works out of the box. For production, set `PUBLIC_API_URL` as an environment variable on your hosting platform (see `.env.example`).

## Deploying to Netlify

1. Push to a GitHub repo
2. Connect the repo on Netlify
3. Build settings are pre-configured in `netlify.toml`
4. Add environment variable: `PUBLIC_API_URL` = your backend URL
5. Deploy

Security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) are applied automatically via the `_headers` file.

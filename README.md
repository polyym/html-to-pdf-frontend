# HTML to PDF Frontend

A web app for converting HTML to PDF documents. Paste code or upload an HTML file, preview it live, and download the result as a PDF.

Built with SvelteKit and deployed on Netlify. Uses the [html-to-pdf-rust-api](https://github.com/polyym/html-to-pdf-rust-api) backend for PDF rendering.

## Features

- Code editor with syntax-friendly monospace input
- HTML file upload via file picker or drag-and-drop (works on the editor too)
- Live HTML preview with auto-sizing
- PDF download with original filename preserved
- API health status indicator
- Keyboard shortcuts: `Ctrl+Enter` to download, `Esc` to clear
- Responsive design with mobile and touch support

## Project Structure

```
src/
├── lib/
│   ├── api.ts          # API communication — health checks, PDF generation, blob download
│   └── files.ts        # File handling — validation, reading, drag-and-drop helpers
├── routes/
│   ├── +layout.svelte  # SEO meta tags (title, OG, Twitter card)
│   └── +page.svelte    # Main page — UI state, template, and styles
└── app.html            # HTML shell — fonts, favicon, theme color
```

- **`src/lib/api.ts`** — All communication with the backend API. Exports functions for checking API health, generating PDFs, and downloading the result. The API URL is read from the `PUBLIC_API_URL` environment variable.
- **`src/lib/files.ts`** — Pure utility functions for loading HTML files from file inputs or drag-and-drop events, validating file extensions, and converting filenames (e.g. `page.html` → `page.pdf`).
- **`src/routes/+page.svelte`** — The main (and only) page. Imports logic from `$lib` and handles UI state, event wiring, and all styling.

## Running Locally

To run the full stack locally, you need both this frontend and the backend API.

### 1. Clone both repos

```bash
git clone https://github.com/polyym/html-to-pdf-rust-api.git
git clone https://github.com/polyym/html-to-pdf-frontend.git
```

### 2. Start the backend API

Requires [Rust](https://rustup.rs/), [Node.js](https://nodejs.org/) v22+, and Chrome/Chromium installed.

```bash
cd html-to-pdf-rust-api
npm install
cargo run
```

The API starts on `http://localhost:3001`. See the [backend README](https://github.com/polyym/html-to-pdf-rust-api#readme) for full setup details and configuration options.

### 3. Start the frontend

```bash
cd html-to-pdf-frontend
npm install
npm run dev
```

The app starts on `http://localhost:5173` and connects to the API at `http://localhost:3001` by default. No configuration needed for local development.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PUBLIC_API_URL` | `http://localhost:3001` | Backend API URL |

The `.env` file sets this to `localhost:3001` for local development. For production, set `PUBLIC_API_URL` as an environment variable on your hosting platform.

## Deploying to Netlify

1. Push to a GitHub repo
2. Connect the repo on Netlify
3. Build settings are configured in `netlify.toml` (build command: `npm run build`, publish: `build`)
4. Add environment variable: `PUBLIC_API_URL` = `https://html-to-pdf-rust-api.onrender.com`
5. Deploy

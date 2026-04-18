<script lang="ts">
	import { onMount } from 'svelte';
	import { API_URL, isLocalApi, checkApiHealth, generatePdf as callGeneratePdf, downloadBlob, type ApiStatus, type PdfOptions, type HealthResponse } from '$lib/api';
	import { loadHtmlFile, getFileFromInput, getFileFromDrop, pdfFileName } from '$lib/files';

	const SUCCESS_TOAST_MS = 2_500;
	const ERROR_TOAST_MS = 7_000;
	const ESC_CONFIRM_WINDOW_MS = 1_500;
	const PREVIEW_DEBOUNCE_MS = 300;
	const HEALTH_POLL_MS = 60_000;
	const HEALTH_BACKOFF_MIN_MS = 5_000;
	const HEALTH_BACKOFF_MAX_MS = 30_000;
	const RATE_LIMIT_FALLBACK_SECS = 30;

	let html = $state('');
	let isLoading = $state(false);
	let errorMessage = $state('');
	let successMessage = $state('');
	let fileName = $state('');
	let fileInputEl = $state<HTMLInputElement | null>(null);
	let isTouchDevice = $state(false);
	let isMac = $state(false);
	let showPreview = $state(false);
	let isDragging = $state(false);
	let pdfOptions = $state<PdfOptions>({
		landscape: false,
		format: 'A4',
		printBackground: true,
		scale: 1,
		omitBackground: false
	});
	let apiStatus = $state<ApiStatus>('checking');
	let apiHasConnected = $state(false);
	let healthData = $state<HealthResponse | null>(null);
	let rateLimitCountdown = $state(0);
	let rateLimitedUntil = 0;
	let rateLimitTimer: ReturnType<typeof setInterval> | null = null;
	let successTimer: ReturnType<typeof setTimeout> | null = null;
	let errorTimer: ReturnType<typeof setTimeout> | null = null;
	let dragCounter = 0;
	let escPendingClear = false;
	let escTimer: ReturnType<typeof setTimeout> | null = null;

	// Debounced copy of html for the preview iframe: avoids re-rendering on every keystroke
	let previewHtml = $state('');

	const hasContent = $derived(html.trim().length > 0);
	const apiReady = $derived(apiStatus === 'online' || apiStatus === 'degraded');

	$effect(() => {
		const current = html;
		const timer = setTimeout(() => { previewHtml = current; }, PREVIEW_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	});

	function showSuccess(msg: string) {
		successMessage = msg;
		if (successTimer) clearTimeout(successTimer);
		successTimer = setTimeout(() => { successMessage = ''; successTimer = null; }, SUCCESS_TOAST_MS);
	}

	function showError(msg: string) {
		errorMessage = msg;
		if (errorTimer) clearTimeout(errorTimer);
		errorTimer = setTimeout(() => { errorMessage = ''; errorTimer = null; }, ERROR_TOAST_MS);
	}

	function dismissSuccess() {
		successMessage = '';
		if (successTimer) { clearTimeout(successTimer); successTimer = null; }
	}

	function dismissError() {
		errorMessage = '';
		if (errorTimer) { clearTimeout(errorTimer); errorTimer = null; }
	}

	function startRateLimitCountdown(seconds: number) {
		rateLimitedUntil = Math.floor(Date.now() / 1000) + seconds;
		rateLimitCountdown = seconds;
		if (rateLimitTimer) clearInterval(rateLimitTimer);
		rateLimitTimer = setInterval(() => {
			const remaining = rateLimitedUntil - Math.floor(Date.now() / 1000);
			if (remaining <= 0) {
				rateLimitCountdown = 0;
				if (rateLimitTimer) { clearInterval(rateLimitTimer); rateLimitTimer = null; }
			} else {
				rateLimitCountdown = remaining;
			}
		}, 1000);
	}

	async function handleFile(file: File) {
		const result = await loadHtmlFile(file);
		if (result.success) {
			html = result.content!;
			fileName = result.fileName!;
			showSuccess(`Loaded ${result.fileName}`);
		} else {
			showError(result.error!);
		}
	}

	function handleFileUpload(e: Event) {
		const file = getFileFromInput(e);
		if (file) handleFile(file);
		// Reset so re-selecting the same file triggers onchange
		if (fileInputEl) fileInputEl.value = '';
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragCounter = 0;
		isDragging = false;
		const file = getFileFromDrop(e);
		if (file) handleFile(file);
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
	}

	function handleDragEnter(e: DragEvent) {
		e.preventDefault();
		dragCounter++;
		isDragging = true;
	}

	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		dragCounter--;
		if (dragCounter <= 0) {
			dragCounter = 0;
			isDragging = false;
		}
	}

	async function generatePdf() {
		clampScale();
		if (!hasContent || isLoading || rateLimitCountdown > 0 || !apiReady) return;

		isLoading = true;
		errorMessage = '';

		try {
			const result = await callGeneratePdf(html, pdfOptions);
			if (result.success && result.blob) {
				downloadBlob(result.blob, pdfFileName(fileName));
				apiHasConnected = true;
				apiStatus = 'online';
				showSuccess('PDF downloaded');
				// Use rate limit reset from response header, fall back to 30s
				startRateLimitCountdown(result.rateLimitResetSecs || RATE_LIMIT_FALLBACK_SECS);
			} else if (result.statusCode === 429 && result.isCapacity) {
				// Concurrency limit: no countdown, can retry when a slot frees
				showError(result.error || 'Server is at capacity. Please try again shortly.');
			} else if (result.statusCode === 429) {
				const wait = result.retryAfterSecs || RATE_LIMIT_FALLBACK_SECS;
				startRateLimitCountdown(wait);
				showError(result.error || `Rate limited. Try again in ${wait} seconds.`);
			} else {
				showError(result.error || 'Failed to generate PDF');
			}
		} catch (err) {
			showError(err instanceof Error ? err.message : 'Failed to generate PDF');
		} finally {
			isLoading = false;
		}
	}

	function clampScale() {
		const v = pdfOptions.scale;
		if (!Number.isFinite(v) || v < 0.1) pdfOptions.scale = 0.1;
		else if (v > 2) pdfOptions.scale = 2;
		else pdfOptions.scale = Math.round(v * 10) / 10;
	}

	function clearAll() {
		html = '';
		fileName = '';
		errorMessage = '';
		successMessage = '';
		showPreview = false;
		if (fileInputEl) fileInputEl.value = '';
	}

	function handleKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
			e.preventDefault();
			generatePdf();
		}
		if (e.key === 'Escape' && hasContent) {
			const appEl = document.querySelector('.app');
			if (appEl && appEl.contains(document.activeElement)) {
				e.preventDefault();
				if (escPendingClear) {
					escPendingClear = false;
					if (escTimer) { clearTimeout(escTimer); escTimer = null; }
					clearAll();
				} else {
					escPendingClear = true;
					showSuccess('Press Esc again to clear');
					escTimer = setTimeout(() => { escPendingClear = false; escTimer = null; dismissSuccess(); }, ESC_CONFIRM_WINDOW_MS);
				}
			}
		}
	}

	onMount(() => {
		isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
		const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
		isMac = uaData?.platform === 'macOS' || /Mac/i.test(navigator.userAgent);
		document.addEventListener('keydown', handleKeydown);

		let healthTimer: ReturnType<typeof setTimeout> | null = null;
		let stopped = false;
		let offlineRetries = 0;

		async function pollHealth() {
			if (stopped) return;
			const result = await checkApiHealth();
			if (result.apiStatus === 'online' || result.apiStatus === 'degraded') {
				apiHasConnected = true;
				apiStatus = result.apiStatus;
				healthData = result.health ?? null;
				offlineRetries = 0;
				// Sync rate limit countdown with server state:
				// - Server done, client still counting → clear client countdown
				// - Server has cooldown we don't know about → start it
				// - Server reports shorter cooldown than client → correct ours
				if (result.health) {
					const serverCooldown = result.health.rate_limiter.cooldown_remaining_secs;
					if (serverCooldown === 0 && rateLimitCountdown > 0) {
						rateLimitCountdown = 0;
						if (rateLimitTimer) { clearInterval(rateLimitTimer); rateLimitTimer = null; }
					} else if (serverCooldown > 0 && (rateLimitCountdown === 0 || serverCooldown < rateLimitCountdown)) {
						startRateLimitCountdown(serverCooldown);
					}
				}
			} else {
				// Stay in 'checking' (pulsing) until we've connected at least once
				apiStatus = apiHasConnected ? 'offline' : 'checking';
				healthData = null;
				offlineRetries++;
			}
			if (stopped) return;
			// 60s when online; exponential backoff when offline: 5s, 10s, 20s, 30s (capped)
			const isUp = result.apiStatus === 'online' || result.apiStatus === 'degraded';
			const delay = isUp ? HEALTH_POLL_MS : Math.min(HEALTH_BACKOFF_MIN_MS * Math.pow(2, offlineRetries - 1), HEALTH_BACKOFF_MAX_MS);
			healthTimer = setTimeout(pollHealth, delay);
		}

		pollHealth();

		return () => {
			stopped = true;
			document.removeEventListener('keydown', handleKeydown);
			if (healthTimer) clearTimeout(healthTimer);
			if (rateLimitTimer) clearInterval(rateLimitTimer);
			if (successTimer) clearTimeout(successTimer);
			if (errorTimer) clearTimeout(errorTimer);
			if (escTimer) clearTimeout(escTimer);
		};
	});
</script>

<div class="app">
	<!-- Header -->
	<header class="header">
		<div class="icon">
			<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
				<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
				<polyline points="14 2 14 8 20 8" />
				<line x1="16" y1="13" x2="8" y2="13" />
				<line x1="16" y1="17" x2="8" y2="17" />
				<polyline points="10 9 9 9 8 9" />
			</svg>
		</div>
		<div class="header-text">
			<h1>HTML to PDF</h1>
			<span class="subtitle">Paste code or upload a file, then download as PDF</span>
		</div>
		<div class="status-indicator" role="status"
			aria-label={apiStatus === 'online' ? 'API is online' : apiStatus === 'degraded' ? 'API is degraded' : apiStatus === 'offline' ? 'API is offline' : 'Connecting to API'}
			title={healthData ? `v${healthData.version} | ${healthData.renders.available}/${healthData.renders.max} render slots` : ''}
		>
			<div class="status-dot" class:online={apiStatus === 'online'} class:degraded={apiStatus === 'degraded'} class:offline={apiStatus === 'offline'} class:checking={apiStatus === 'checking'} aria-hidden="true"></div>
			<span class="status-label" aria-hidden="true">
				{apiStatus === 'online' ? 'Online' : apiStatus === 'degraded' ? 'Degraded' : apiStatus === 'offline' ? 'Offline' : 'Starting...'}
				{#if healthData}<span class="version-tag">· API v{healthData.version}</span>{/if}
			</span>
		</div>
	</header>

	<!-- Toasts -->
	{#if successMessage}
		<div class="toast success" role="alert">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<polyline points="20 6 9 17 4 12" />
			</svg>
			{successMessage}
			<button class="toast-dismiss" onclick={dismissSuccess} aria-label="Dismiss notification">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
				</svg>
			</button>
		</div>
	{/if}

	{#if errorMessage}
		<div class="toast error" role="alert">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="12" cy="12" r="10" />
				<line x1="15" y1="9" x2="9" y2="15" />
				<line x1="9" y1="9" x2="15" y2="15" />
			</svg>
			{errorMessage}
			<button class="toast-dismiss" onclick={dismissError} aria-label="Dismiss notification">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
				</svg>
			</button>
		</div>
	{/if}

	<!-- Editor -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="field" role="region" aria-label="HTML input" class:dragging={isDragging} ondrop={handleDrop} ondragover={handleDragOver} ondragenter={handleDragEnter} ondragleave={handleDragLeave}>
		<div class="field-header">
			<label for="html-input">
				HTML Code
				{#if fileName}
					<span class="file-badge">{fileName}</span>
				{/if}
			</label>
			{#if hasContent}
				<button class="preview-link" aria-expanded={showPreview} onclick={() => (showPreview = !showPreview)}>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						{#if showPreview}
							<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
							<line x1="1" y1="1" x2="23" y2="23" />
						{:else}
							<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
							<circle cx="12" cy="12" r="3" />
						{/if}
					</svg>
					{showPreview ? 'Hide' : 'Preview'}
				</button>
			{/if}
		</div>
		<textarea
			id="html-input"
			class="mono"
			bind:value={html}
			placeholder={'<!DOCTYPE html>\n<html>\n<head>\n  <style>\n    body { font-family: sans-serif; }\n  </style>\n</head>\n<body>\n  <h1>Your content here</h1>\n</body>\n</html>'}
			spellcheck="false"
		></textarea>
		<input
			type="file"
			accept=".html,.htm"
			onchange={handleFileUpload}
			bind:this={fileInputEl}
			class="file-input-hidden"
			aria-label="Upload HTML file"
			tabindex="-1"
		/>
		<p class="drop-hint">Drop an .html or .htm file, or <button class="browse-link" onclick={() => fileInputEl?.click()}>browse</button></p>
	</div>

	<!-- PDF Options -->
	<details class="pdf-options-details">
		<summary>PDF Options</summary>
		<div class="pdf-options-grid">
			<div class="option-group">
				<span class="option-label">Orientation</span>
				<div class="toggle-group" role="group" aria-label="Page orientation">
					<button
						class="toggle-btn"
						class:active={!pdfOptions.landscape}
						aria-pressed={!pdfOptions.landscape}
						onclick={() => (pdfOptions.landscape = false)}
					>Portrait</button>
					<button
						class="toggle-btn"
						class:active={pdfOptions.landscape}
						aria-pressed={pdfOptions.landscape}
						onclick={() => (pdfOptions.landscape = true)}
					>Landscape</button>
				</div>
			</div>
			<div class="option-group">
				<label class="option-label" for="page-size">Page Size</label>
				<select id="page-size" class="option-select" bind:value={pdfOptions.format}>
					<option value="A0">A0</option>
					<option value="A1">A1</option>
					<option value="A2">A2</option>
					<option value="A3">A3</option>
					<option value="A4">A4</option>
					<option value="A5">A5</option>
					<option value="A6">A6</option>
					<option value="Letter">Letter</option>
					<option value="Legal">Legal</option>
					<option value="Tabloid">Tabloid</option>
					<option value="Ledger">Ledger</option>
				</select>
			</div>
			<div class="option-group">
				<label class="option-label" for="scale">Scale</label>
				<input
					id="scale"
					type="number"
					class="option-input"
					bind:value={pdfOptions.scale}
					min="0.1"
					max="2"
					step="0.1"
					onblur={clampScale}
				/>
			</div>
			<div class="option-group">
				<label class="option-checkbox-label">
					<input type="checkbox" bind:checked={pdfOptions.printBackground} />
					<span>Print Background</span>
				</label>
			</div>
			<div class="option-group">
				<label class="option-checkbox-label">
					<input type="checkbox" bind:checked={pdfOptions.omitBackground} />
					<span>Omit Background</span>
				</label>
			</div>
		</div>
	</details>

	<!-- Live Preview -->
	{#if showPreview && hasContent}
		<div class="preview-container">
			<div class="preview-header">
				<span>Preview</span>
			</div>
			<div class="preview-frame">
				<iframe
					srcdoc={previewHtml}
					sandbox=""
					title="HTML Preview"
				></iframe>
			</div>
		</div>
	{/if}

	<!-- About -->
	<details class="about-details">
		<summary>About this tool</summary>
		<p>
			Powered by a Rust web server and a Node.js worker that uses
			<a href="https://pptr.dev/" target="_blank" rel="noopener noreferrer">Puppeteer</a>
			to render your HTML in headless Chrome and convert it to a PDF.
			{#if !isLocalApi}
				The backend API is open and available at
				<a href={API_URL + '/health'} target="_blank" rel="noopener noreferrer">{API_URL}</a>.
			{/if}
			This project is open source; view the code for the
			<a href="https://github.com/polyym/html-to-pdf-frontend" target="_blank" rel="noopener noreferrer">website</a>
			and the <a href="https://github.com/polyym/html-to-pdf-rust-api" target="_blank" rel="noopener noreferrer">backend API</a>
			on GitHub.
		</p>
	</details>

	<!-- Footer -->
	<footer class="footer">
		<span class="credit">by <a href="https://github.com/polyym" target="_blank" rel="noopener noreferrer">polyym</a></span>
	</footer>

	<!-- Spacer for fixed bottom -->
	<div class="bottom-spacer"></div>

	<!-- Bottom Actions -->
	<div class="bottom-actions">
		{#if !apiReady}
			<p class="api-hint">
				{apiStatus === 'offline'
					? 'Backend is offline'
					: 'Backend is starting up. First load can take 30-60s'}
			</p>
		{/if}
		<div class="bottom-actions-inner">
			<span class="sr-only" aria-live="polite" aria-atomic="true">
				{#if isLoading}Generating PDF, please wait.
				{:else if !apiReady}API is starting, please wait.
				{:else if rateLimitCountdown > 0}Rate limited, try again in {rateLimitCountdown} seconds.
				{/if}
			</span>
			{#if hasContent}
				<button class="btn secondary" onclick={clearAll} aria-label="Clear all">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="18" y1="6" x2="6" y2="18" />
						<line x1="6" y1="6" x2="18" y2="18" />
					</svg>
					Clear
					{#if !isTouchDevice}<kbd>Esc</kbd>{/if}
				</button>
			{/if}
			<button class="btn primary" disabled={!hasContent || isLoading || rateLimitCountdown > 0 || !apiReady} onclick={generatePdf}>
				{#if isLoading}
					<div class="spinner"></div>
					Generating...
				{:else if !apiReady}
					<div class="spinner"></div>
					Waking API...
				{:else if rateLimitCountdown > 0}
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="10" />
						<polyline points="12 6 12 12 16 14" />
					</svg>
					Try again in {rateLimitCountdown}s
				{:else}
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
						<polyline points="7 10 12 15 17 10" />
						<line x1="12" y1="15" x2="12" y2="3" />
					</svg>
					Download PDF
					{#if !isTouchDevice}
						<kbd>{isMac ? '⌘+Enter' : 'Ctrl+Enter'}</kbd>
					{/if}
				{/if}
			</button>
		</div>
	</div>
</div>

<style>
	:global(*) {
		box-sizing: border-box;
		-webkit-tap-highlight-color: transparent;
	}

	:global(body) {
		margin: 0;
		background: #09090b;
	}

	.app {
		--bg: #09090b;
		--surface: #0f0f12;
		--surface-2: #16161a;
		--border: #1f1f24;
		--border-hover: #2a2a30;
		--text: #fafafa;
		--text-secondary: #71717a;
		--text-dim: #3f3f46;
		--success: #22c55e;
		--error: #ef4444;
		--accent: #3b82f6;
		--warning: #f59e0b;
		--font: 'Inter', -apple-system, sans-serif;
		--mono: 'IBM Plex Mono', monospace;

		--safe-top: env(safe-area-inset-top, 0px);
		--safe-bottom: env(safe-area-inset-bottom, 0px);
		--safe-left: env(safe-area-inset-left, 0px);
		--safe-right: env(safe-area-inset-right, 0px);

		min-height: 100vh;
		min-height: 100dvh;
		background: var(--bg);
		font-family: var(--font);
		color: var(--text);
		-webkit-font-smoothing: antialiased;

		max-width: 960px;
		margin: 0 auto;
		padding: 20px;
		padding-top: calc(20px + var(--safe-top));
		padding-bottom: calc(20px + var(--safe-bottom));
		padding-left: calc(20px + var(--safe-left));
		padding-right: calc(20px + var(--safe-right));
	}

	/* Header */
	.header {
		display: flex;
		align-items: center;
		gap: 16px;
		margin-bottom: 28px;
	}

	.icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 56px;
		height: 56px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 14px;
		color: var(--text);
		flex-shrink: 0;
	}

	.header-text {
		display: flex;
		flex-direction: column;
		gap: 4px;
		flex: 1;
	}

	/* Status Indicator */
	.status-indicator {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-shrink: 0;
		align-self: flex-start;
		margin-top: 6px;
	}

	.status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.status-dot.online {
		background: var(--success);
		box-shadow: 0 0 6px rgba(34, 197, 94, 0.4);
	}

	.status-dot.offline {
		background: var(--error);
		box-shadow: 0 0 6px rgba(239, 68, 68, 0.4);
	}

	.status-dot.degraded {
		background: var(--warning);
		box-shadow: 0 0 6px rgba(245, 158, 11, 0.4);
	}

	.status-dot.checking {
		background: var(--text-dim);
		animation: pulse 1.5s ease infinite;
	}

	.status-label {
		font-size: 11px;
		font-weight: 500;
		color: var(--text-secondary);
		white-space: nowrap;
	}

	.version-tag {
		font-size: 10px;
		font-weight: 400;
		color: var(--text-dim);
		margin-left: 4px;
	}

	@keyframes pulse {
		0%, 100% { opacity: 0.4; }
		50% { opacity: 1; }
	}

	h1 {
		font-size: 26px;
		font-weight: 600;
		letter-spacing: -0.5px;
		margin: 0;
	}

	.subtitle {
		font-size: 13px;
		font-weight: 500;
		color: var(--text-secondary);
	}

	/* Toast */
	.toast {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 16px;
		margin-bottom: 20px;
		font-size: 14px;
		font-weight: 500;
		border-radius: 10px;
		animation: fadeIn 0.2s ease;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.toast.success {
		background: rgba(34, 197, 94, 0.1);
		border: 1px solid rgba(34, 197, 94, 0.2);
		color: var(--success);
	}

	.toast.error {
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.2);
		color: var(--error);
	}

	.toast-dismiss {
		margin-left: auto;
		background: none;
		border: none;
		color: inherit;
		opacity: 0.5;
		cursor: pointer;
		padding: 2px;
		display: flex;
		align-items: center;
		border-radius: 4px;
		transition: opacity 0.15s ease;
		flex-shrink: 0;
	}

	.toast-dismiss:hover {
		opacity: 1;
	}

	/* Field */
	.field {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-bottom: 16px;
	}

	.field-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	label {
		font-size: 13px;
		font-weight: 500;
		color: var(--text-secondary);
		padding-left: 2px;
	}

	.file-badge {
		display: inline-block;
		font-size: 11px;
		font-weight: 500;
		font-family: var(--mono);
		color: var(--success);
		background: rgba(34, 197, 94, 0.1);
		border: 1px solid rgba(34, 197, 94, 0.2);
		padding: 2px 8px;
		border-radius: 6px;
		margin-left: 8px;
		vertical-align: middle;
	}

	.preview-link {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-family: var(--font);
		font-size: 12px;
		font-weight: 500;
		color: var(--text-dim);
		background: none;
		border: none;
		cursor: pointer;
		padding: 4px 8px;
		border-radius: 6px;
		transition: all 0.15s ease;
	}

	.preview-link:hover {
		color: var(--text-secondary);
		background: var(--surface-2);
	}

	textarea {
		width: 100%;
		min-height: 240px;
		padding: 14px 16px;
		font-family: var(--font);
		font-size: 16px;
		line-height: 1.6;
		color: var(--text);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 12px;
		resize: vertical;
		transition: border-color 0.15s ease, box-shadow 0.15s ease;
	}

	textarea::placeholder {
		color: var(--text-dim);
	}

	textarea:hover {
		border-color: var(--border-hover);
	}

	textarea:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 1px var(--accent);
	}

	textarea.mono {
		font-family: var(--mono);
		font-size: 16px;
		tab-size: 2;
	}

	/* Drag and drop */
	.field.dragging textarea {
		border-color: var(--accent);
		border-style: dashed;
	}

	.file-input-hidden {
		position: absolute;
		width: 0;
		height: 0;
		opacity: 0;
		pointer-events: none;
	}

	.drop-hint {
		font-size: 12px;
		color: var(--text-dim);
		margin: 0;
		padding-left: 2px;
	}

	.browse-link {
		font-family: var(--font);
		font-size: 12px;
		font-weight: 500;
		color: var(--accent);
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.browse-link:hover {
		color: var(--text);
	}

	/* Preview Container */
	.preview-container {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 14px;
		overflow: hidden;
		margin-bottom: 16px;
		animation: fadeIn 0.2s ease;
	}

	.preview-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		border-bottom: 1px solid var(--border);
		font-size: 13px;
		font-weight: 500;
		color: var(--text-secondary);
	}

	.preview-frame {
		background: #ffffff;
		max-height: min(400px, 50vh);
		overflow-y: auto;
	}

	.preview-frame iframe {
		width: 100%;
		height: 400px;
		border: none;
		display: block;
	}

	/* PDF Options */
	.pdf-options-details {
		margin-bottom: 16px;
	}

	.pdf-options-details summary {
		font-size: 13px;
		font-weight: 500;
		color: var(--text-dim);
		cursor: pointer;
		padding: 8px 0;
		list-style: none;
		transition: color 0.15s ease;
	}

	.pdf-options-details summary::-webkit-details-marker {
		display: none;
	}

	.pdf-options-details summary::before {
		content: '+ ';
		font-family: var(--mono);
	}

	.pdf-options-details[open] summary::before {
		content: '- ';
	}

	.pdf-options-details summary:hover {
		color: var(--text-secondary);
	}

	.pdf-options-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
		padding: 16px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
		margin-top: 4px;
	}

	.option-group {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.option-label {
		font-size: 12px;
		font-weight: 500;
		color: var(--text-secondary);
		padding: 0;
	}

	.toggle-group {
		display: flex;
		gap: 0;
		border: 1px solid var(--border);
		border-radius: 8px;
		overflow: hidden;
	}

	.toggle-btn {
		flex: 1;
		padding: 8px 12px;
		font-family: var(--font);
		font-size: 13px;
		font-weight: 500;
		color: var(--text-dim);
		background: transparent;
		border: none;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.toggle-btn:not(:last-child) {
		border-right: 1px solid var(--border);
	}

	.toggle-btn.active {
		color: var(--text);
		background: var(--surface-2);
	}

	.toggle-btn:hover:not(.active) {
		color: var(--text-secondary);
	}

	.toggle-btn:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}

	.option-select,
	.option-input {
		padding: 8px 12px;
		font-family: var(--font);
		font-size: 13px;
		color: var(--text);
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 8px;
		transition: border-color 0.15s ease, box-shadow 0.15s ease;
	}

	.option-select:hover,
	.option-input:hover {
		border-color: var(--border-hover);
	}

	.option-select:focus,
	.option-input:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 1px var(--accent);
	}

	.option-input {
		width: 100%;
	}

	.option-checkbox-label {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		font-weight: 500;
		color: var(--text-secondary);
		cursor: pointer;
		padding: 8px 0;
	}

	.option-checkbox-label input[type="checkbox"] {
		width: 16px;
		height: 16px;
		accent-color: var(--accent);
		cursor: pointer;
	}

	@media (max-width: 480px) {
		.pdf-options-grid {
			grid-template-columns: 1fr;
		}
	}

	/* About */
	.about-details {
		margin-bottom: 8px;
	}

	.about-details summary {
		font-size: 13px;
		font-weight: 500;
		color: var(--text-dim);
		cursor: pointer;
		padding: 8px 0;
		list-style: none;
		transition: color 0.15s ease;
	}

	.about-details summary::-webkit-details-marker {
		display: none;
	}

	.about-details summary::before {
		content: '+ ';
		font-family: var(--mono);
	}

	.about-details[open] summary::before {
		content: '- ';
	}

	.about-details summary:hover {
		color: var(--text-secondary);
	}

	.about-details p {
		font-size: 14px;
		line-height: 1.6;
		color: var(--text-secondary);
		margin: 4px 0 0;
		padding: 12px 16px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
	}

	.about-details a {
		color: var(--text);
		text-decoration: underline;
		text-underline-offset: 2px;
		transition: color 0.15s ease;
	}

	.about-details a:hover {
		color: var(--success);
	}

	/* Footer */
	.footer {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px 0 8px;
		font-size: 13px;
	}

	.credit {
		color: var(--text-dim);
		font-size: 12px;
	}

	.credit a {
		color: var(--text-dim);
		text-decoration: none;
		transition: color 0.15s ease;
	}

	.credit a:hover {
		color: var(--text-secondary);
	}

	/* Bottom Actions */
	.bottom-spacer {
		height: 100px;
	}

	.bottom-actions {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 50;
		background: linear-gradient(to top, var(--bg) 70%, transparent);
		padding: 16px 20px;
		padding-bottom: calc(16px + var(--safe-bottom));
		padding-left: calc(20px + var(--safe-left));
		padding-right: calc(20px + var(--safe-right));
	}

	.bottom-actions-inner {
		display: flex;
		gap: 10px;
		max-width: 960px;
		margin: 0 auto;
	}

	.api-hint {
		max-width: 960px;
		margin: 0 auto 8px;
		font-size: 12px;
		color: var(--text-dim);
		text-align: center;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		min-height: 52px;
		padding: 14px 24px;
		font-family: var(--font);
		font-size: 15px;
		font-weight: 600;
		border-radius: 12px;
		border: none;
		cursor: pointer;
		transition: all 0.15s ease;
		user-select: none;
	}

	.btn kbd {
		font-family: var(--font);
		font-size: 11px;
		opacity: 0.5;
		margin-left: 4px;
		background: none;
		border: none;
		padding: 0;
		min-width: auto;
		height: auto;
	}

	.btn.primary {
		flex: 1;
		color: #000;
		background: var(--text);
	}

	.btn.primary:hover:not(:disabled) {
		background: #e4e4e7;
	}

	.btn.primary:active:not(:disabled) {
		background: #d4d4d8;
		transform: scale(0.98);
	}

	.btn.primary:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.btn.secondary {
		color: var(--text-secondary);
		background: var(--surface);
		border: 1px solid var(--border);
		padding: 14px 16px;
	}

	.btn.secondary:hover {
		color: var(--text);
		border-color: var(--border-hover);
	}

	.btn.secondary:active {
		background: var(--surface-2);
		transform: scale(0.98);
	}

	/* Spinner */
	.spinner {
		width: 16px;
		height: 16px;
		border: 2px solid rgba(0, 0, 0, 0.2);
		border-top-color: #000;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Screen reader only */
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	/* Responsive - Small Phones */
	@media (max-width: 380px) {
		h1 {
			font-size: 22px;
		}

		.icon {
			width: 48px;
			height: 48px;
		}

		.icon :global(svg) {
			width: 24px;
			height: 24px;
		}

		.bottom-actions {
			padding-left: 16px;
			padding-right: 16px;
		}

		.status-label {
			display: none;
		}

		.btn kbd {
			display: none;
		}
	}

	/* Responsive - Tablets and larger */
	@media (min-width: 768px) {
		.app {
			padding: 40px;
			padding-top: calc(40px + var(--safe-top));
		}

		h1 {
			font-size: 30px;
		}

		textarea {
			min-height: 320px;
		}
	}

	/* Landscape mobile */
	@media (max-height: 500px) and (orientation: landscape) {
		.header {
			margin-bottom: 16px;
		}

		.icon {
			width: 40px;
			height: 40px;
		}

		h1 {
			font-size: 20px;
		}

		textarea {
			min-height: 150px;
			flex: 1;
		}

		.bottom-actions {
			padding: 12px 20px;
		}

		.btn {
			min-height: 44px;
			padding: 10px 20px;
		}
	}

	/* Reduce motion for accessibility */
	@media (prefers-reduced-motion: reduce) {
		.toast,
		.preview-container {
			animation: none;
		}

		.btn:active {
			transform: none;
		}
	}
</style>

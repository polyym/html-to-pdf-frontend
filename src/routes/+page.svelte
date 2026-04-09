<script lang="ts">
	import { onMount } from 'svelte';
	import { API_URL, isLocalApi, checkApiHealth, generatePdf as callGeneratePdf, downloadBlob, type ApiStatus } from '$lib/api';
	import { loadHtmlFile, getFileFromInput, getFileFromDrop, pdfFileName } from '$lib/files';

	let html = $state('');
	let isLoading = $state(false);
	let errorMessage = $state('');
	let successMessage = $state('');
	let activeTab = $state<'editor' | 'upload'>('editor');
	let fileName = $state('');
	let fileInputEl = $state<HTMLInputElement | null>(null);
	let isTouchDevice = $state(false);
	let isMac = $state(false);
	let showPreview = $state(false);
	let apiStatus = $state<ApiStatus>('checking');
	let apiHasConnected = $state(false);
	let successTimer: ReturnType<typeof setTimeout> | null = null;
	let errorTimer: ReturnType<typeof setTimeout> | null = null;

	const hasContent = $derived(html.trim().length > 0);

	function showSuccess(msg: string) {
		successMessage = msg;
		if (successTimer) clearTimeout(successTimer);
		successTimer = setTimeout(() => { successMessage = ''; successTimer = null; }, 2500);
	}

	function showError(msg: string) {
		errorMessage = msg;
		if (errorTimer) clearTimeout(errorTimer);
		errorTimer = setTimeout(() => { errorMessage = ''; errorTimer = null; }, 4000);
	}

	function dismissSuccess() {
		successMessage = '';
		if (successTimer) { clearTimeout(successTimer); successTimer = null; }
	}

	function dismissError() {
		errorMessage = '';
		if (errorTimer) { clearTimeout(errorTimer); errorTimer = null; }
	}

	async function handleFile(file: File) {
		const result = await loadHtmlFile(file);
		if (result.success) {
			html = result.content!;
			fileName = result.fileName!;
			activeTab = 'editor';
			showSuccess(`Loaded ${result.fileName}`);
		} else {
			showError(result.error!);
		}
	}

	function handleFileUpload(e: Event) {
		const file = getFileFromInput(e);
		if (file) handleFile(file);
	}

	function handleDrop(e: DragEvent) {
		const file = getFileFromDrop(e);
		if (file) handleFile(file);
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
	}

	async function generatePdf() {
		if (!hasContent || isLoading) return;

		isLoading = true;
		errorMessage = '';

		try {
			const result = await callGeneratePdf(html);
			if (result.success && result.blob) {
				downloadBlob(result.blob, pdfFileName(fileName));
				apiHasConnected = true;
				apiStatus = 'online';
				showSuccess('PDF downloaded');
			} else {
				throw new Error(result.error || 'Failed to generate PDF');
			}
		} catch (err) {
			showError(err instanceof Error ? err.message : 'Failed to generate PDF');
		} finally {
			isLoading = false;
		}
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
				clearAll();
			}
		}
	}

	onMount(() => {
		isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
		isMac = (navigator as any).userAgentData?.platform === 'macOS' || navigator.platform?.toUpperCase().includes('MAC') || navigator.userAgent.includes('Mac');
		document.addEventListener('keydown', handleKeydown);

		let healthTimer: ReturnType<typeof setTimeout> | null = null;
		let stopped = false;

		async function pollHealth() {
			if (stopped) return;
			const status = await checkApiHealth();
			if (status === 'online') {
				apiHasConnected = true;
				apiStatus = 'online';
			} else {
				// Stay in 'checking' (pulsing) until we've connected at least once
				apiStatus = apiHasConnected ? 'offline' : 'checking';
			}
			if (stopped) return;
			// Retry every 5s while not online, relax to 60s once online
			const delay = status === 'online' ? 60_000 : 5_000;
			healthTimer = setTimeout(pollHealth, delay);
		}

		pollHealth();

		return () => {
			stopped = true;
			document.removeEventListener('keydown', handleKeydown);
			if (healthTimer) clearTimeout(healthTimer);
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
		<div class="status-indicator" role="status" aria-label={apiStatus === 'online' ? 'API is online' : apiStatus === 'offline' ? 'API is offline' : 'Connecting to API'}>
			<div class="status-dot" class:online={apiStatus === 'online'} class:offline={apiStatus === 'offline'} class:checking={apiStatus === 'checking'} aria-hidden="true"></div>
			<span class="status-label" aria-hidden="true">{apiStatus === 'online' ? 'Online' : apiStatus === 'offline' ? 'Offline' : 'Connecting...'}</span>
		</div>
	</header>

	<!-- Startup banner -->
	{#if !apiHasConnected && apiStatus !== 'online'}
		<div class="startup-banner" role="status">
			<div class="startup-spinner"></div>
			Backend is starting up, this may take a moment...
		</div>
	{/if}

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

	<!-- Tabs -->
	<div class="tabs" role="tablist">
		<button class="tab" class:active={activeTab === 'editor'} onclick={() => (activeTab = 'editor')} role="tab" id="tab-editor" aria-selected={activeTab === 'editor'} aria-controls="tabpanel-editor" tabindex={activeTab === 'editor' ? 0 : -1} onkeydown={(e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); activeTab = activeTab === 'editor' ? 'upload' : 'editor'; requestAnimationFrame(() => document.getElementById(`tab-${activeTab}`)?.focus()); } }}>
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<polyline points="16 18 22 12 16 6" />
				<polyline points="8 6 2 12 8 18" />
			</svg>
			Editor
		</button>
		<button class="tab" class:active={activeTab === 'upload'} onclick={() => (activeTab = 'upload')} role="tab" id="tab-upload" aria-selected={activeTab === 'upload'} aria-controls="tabpanel-upload" tabindex={activeTab === 'upload' ? 0 : -1} onkeydown={(e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); activeTab = activeTab === 'editor' ? 'upload' : 'editor'; requestAnimationFrame(() => document.getElementById(`tab-${activeTab}`)?.focus()); } }}>
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
				<polyline points="17 8 12 3 7 8" />
				<line x1="12" y1="3" x2="12" y2="15" />
			</svg>
			Upload
		</button>
	</div>

	<!-- Editor Tab -->
		<div class="field" ondrop={handleDrop} ondragover={handleDragOver} role="tabpanel" id="tabpanel-editor" aria-labelledby="tab-editor" tabindex="0" hidden={activeTab !== 'editor'}>
			<div class="field-header">
				<label for="html-input">
					HTML Code
					{#if fileName}
						<span class="file-badge">{fileName}</span>
					{/if}
				</label>
				{#if hasContent}
					<button class="clear-btn" onclick={clearAll} aria-label="Clear editor">Clear</button>
				{/if}
			</div>
			<textarea
				id="html-input"
				class="mono"
				bind:value={html}
				placeholder={'<!DOCTYPE html>\n<html>\n<head>\n  <style>\n    body { font-family: sans-serif; }\n  </style>\n</head>\n<body>\n  <h1>Your content here</h1>\n</body>\n</html>'}
				spellcheck="false"
			></textarea>
		</div>

	<!-- Upload Tab -->
		<div
			class="drop-zone"
			ondrop={handleDrop}
			ondragover={handleDragOver}
			role="tabpanel"
			id="tabpanel-upload"
			aria-labelledby="tab-upload"
			tabindex="0"
			hidden={activeTab !== 'upload'}
		>
			<input
				type="file"
				accept=".html,.htm"
				onchange={handleFileUpload}
				bind:this={fileInputEl}
				class="file-input"
				aria-label="Upload HTML file"
			/>
			<div class="drop-icon">
				<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
					<polyline points="17 8 12 3 7 8" />
					<line x1="12" y1="3" x2="12" y2="15" />
				</svg>
			</div>
			<p class="drop-label">
				{#if fileName}
					<span class="file-name">{fileName}</span>
				{:else}
					Drop an HTML file here or <span class="browse">browse</span>
				{/if}
			</p>
			<p class="drop-hint">Accepts .html and .htm files</p>
		</div>

	<!-- Preview Toggle -->
	{#if hasContent}
		<button class="preview-toggle" onclick={() => (showPreview = !showPreview)}>
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				{#if showPreview}
					<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
					<line x1="1" y1="1" x2="23" y2="23" />
				{:else}
					<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
					<circle cx="12" cy="12" r="3" />
				{/if}
			</svg>
			{showPreview ? 'Hide Preview' : 'Show Preview'}
		</button>
	{/if}

	<!-- Live Preview -->
	{#if showPreview && hasContent}
		<div class="preview-container">
			<div class="preview-header">
				<span>Preview</span>
			</div>
			<div class="preview-frame">
				<iframe
					srcdoc={html}
					sandbox=""
					title="HTML Preview"
				></iframe>
			</div>
		</div>
	{/if}

	<!-- Info -->
	<details class="info-details">
		<summary>About this tool</summary>
		<p>
			Powered by a <strong>Rust</strong> web server and a <strong>Node.js</strong> worker
			that uses <a href="https://pptr.dev/" target="_blank" rel="noopener noreferrer">Puppeteer</a>
			to render your HTML in headless Chrome and convert it to a PDF.
			{#if !isLocalApi}
				The backend API is open and available at
				<a href={API_URL + '/health'} target="_blank" rel="noopener noreferrer">{API_URL}</a>.
			{/if}
			This project is open source — view the code for the <a href="https://github.com/polyym/html-to-pdf-frontend" target="_blank" rel="noopener noreferrer">website</a> and the <a href="https://github.com/polyym/html-to-pdf-rust-api" target="_blank" rel="noopener noreferrer">backend API</a> on GitHub.
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
		<div class="bottom-actions-inner">
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
			<button class="btn primary" disabled={!hasContent || isLoading} onclick={generatePdf}>
				{#if isLoading}
					<div class="spinner"></div>
					Generating...
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

		max-width: 640px;
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

	/* Startup Banner */
	.startup-banner {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 16px;
		margin-bottom: 20px;
		font-size: 14px;
		font-weight: 500;
		color: var(--text-secondary);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
		animation: fadeIn 0.2s ease;
	}

	.startup-spinner {
		width: 14px;
		height: 14px;
		border: 2px solid var(--border-hover);
		border-top-color: var(--text-secondary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
		flex-shrink: 0;
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

	/* Info Details */
	.info-details {
		margin-bottom: 8px;
	}

	.info-details summary {
		font-size: 13px;
		font-weight: 500;
		color: var(--text-dim);
		cursor: pointer;
		padding: 8px 0;
		list-style: none;
		transition: color 0.15s ease;
	}

	.info-details summary::-webkit-details-marker {
		display: none;
	}

	.info-details summary::before {
		content: '+ ';
		font-family: var(--mono);
	}

	.info-details[open] summary::before {
		content: '- ';
	}

	.info-details summary:hover {
		color: var(--text-secondary);
	}

	.info-details p {
		font-size: 14px;
		line-height: 1.6;
		color: var(--text-secondary);
		margin: 4px 0 0;
		padding: 12px 16px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
	}

	.info-details strong {
		color: var(--text);
		font-weight: 600;
	}

	.info-details a {
		color: var(--text);
		text-decoration: underline;
		text-underline-offset: 2px;
		transition: color 0.15s ease;
	}

	.info-details a:hover {
		color: var(--success);
	}

	/* Tabs */
	.tabs {
		display: flex;
		gap: 8px;
		margin-bottom: 20px;
	}

	.tab {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 10px 18px;
		font-family: var(--font);
		font-size: 14px;
		font-weight: 500;
		color: var(--text-secondary);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.tab:hover {
		color: var(--text);
		border-color: var(--border-hover);
	}

	.tab.active {
		color: var(--text);
		background: var(--surface-2);
		border-color: var(--border-hover);
	}

	.tab:active {
		transform: scale(0.98);
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

	.clear-btn {
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

	.clear-btn:hover {
		color: var(--error);
		background: rgba(239, 68, 68, 0.1);
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
		transition: border-color 0.15s ease;
	}

	textarea::placeholder {
		color: var(--text-dim);
	}

	textarea:hover {
		border-color: var(--border-hover);
	}

	textarea:focus {
		outline: none;
		border-color: #3f3f46;
	}

	textarea.mono {
		font-family: var(--mono);
		font-size: 16px;
		tab-size: 2;
	}

	/* Drop Zone */
	.drop-zone {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		min-height: 200px;
		padding: 32px 20px;
		background: var(--surface);
		border: 2px dashed var(--border);
		border-radius: 14px;
		cursor: pointer;
		transition: all 0.15s ease;
		margin-bottom: 16px;
	}

	.drop-zone:hover {
		border-color: var(--border-hover);
		background: var(--surface-2);
	}

	.file-input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		cursor: pointer;
	}

	.drop-zone:focus-within {
		border-color: var(--accent);
		background: var(--surface-2);
	}

	.drop-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 56px;
		height: 56px;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 14px;
		color: var(--text-secondary);
	}

	.drop-label {
		font-size: 15px;
		font-weight: 500;
		color: var(--text-secondary);
		margin: 0;
		text-align: center;
	}

	.browse {
		color: var(--accent);
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.file-name {
		color: var(--success);
	}

	.drop-hint {
		font-size: 13px;
		color: var(--text-dim);
		margin: 0;
	}

	/* Preview Toggle */
	.preview-toggle {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 10px 16px;
		font-family: var(--font);
		font-size: 13px;
		font-weight: 500;
		color: var(--text-secondary);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
		cursor: pointer;
		transition: all 0.15s ease;
		margin-bottom: 16px;
	}

	.preview-toggle:hover {
		color: var(--text);
		border-color: var(--border-hover);
	}

	.preview-toggle:active {
		transform: scale(0.98);
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
		max-height: 600px;
		overflow-y: auto;
	}

	.preview-frame iframe {
		width: 100%;
		height: 400px;
		border: none;
		display: block;
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
	}

	.credit a {
		color: var(--text-secondary);
		text-decoration: none;
		transition: color 0.15s ease;
	}

	.credit a:hover {
		color: var(--text);
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
		max-width: 640px;
		margin: 0 auto;
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

		.tab {
			padding: 8px 14px;
			font-size: 13px;
		}

		.bottom-actions {
			padding-left: 16px;
			padding-right: 16px;
		}

		.status-label {
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

		.preview-frame {
			max-height: 700px;
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
			min-height: 120px;
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

		.btn:active,
		.tab:active,
		.preview-toggle:active {
			transform: none;
		}
	}
</style>

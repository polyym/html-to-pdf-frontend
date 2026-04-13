import { PUBLIC_API_URL } from '$env/static/public';

export const API_URL = PUBLIC_API_URL || 'http://localhost:3001';
export const isLocalApi = /localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0/.test(API_URL);

const HEALTH_TIMEOUT_MS = 5_000;
const RENDER_TIMEOUT_MS = 35_000;
const MAX_HTML_SIZE_BYTES = 5 * 1024 * 1024; // 5MB, matches backend limit
const BLOB_REVOKE_DELAY_MS = 1_000;

export type ApiStatus = 'checking' | 'online' | 'degraded' | 'offline';

export interface HealthResponse {
	status: 'ok' | 'degraded';
	version: string;
	uptime_secs: number;
	worker_alive: boolean;
	renders: { available: number; max: number };
	rate_limiter: { cooldown_remaining_secs: number };
}

export interface HealthCheckResult {
	apiStatus: ApiStatus;
	health?: HealthResponse;
}

export async function checkApiHealth(): Promise<HealthCheckResult> {
	try {
		const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
		if (!res.ok) return { apiStatus: 'offline' };
		const health: HealthResponse = await res.json();
		const apiStatus: ApiStatus = health.status === 'ok' ? 'online' : 'degraded';
		return { apiStatus, health };
	} catch {
		return { apiStatus: 'offline' };
	}
}

export interface PdfOptions {
	landscape: boolean;
	format: string;
	printBackground: boolean;
	scale: number;
	omitBackground: boolean;
}

export interface GeneratePdfResult {
	success: boolean;
	blob?: Blob;
	error?: string;
	statusCode?: number;
	retryAfterSecs?: number;
	rateLimitResetSecs?: number;
	isCapacity?: boolean;
}

export async function generatePdf(html: string, options: PdfOptions): Promise<GeneratePdfResult> {
	if (!html || !html.trim()) {
		return { success: false, error: 'HTML content cannot be empty.', statusCode: 400 };
	}

	if (new Blob([html]).size > MAX_HTML_SIZE_BYTES) {
		return { success: false, error: 'HTML content is too large. Maximum size is 5MB.', statusCode: 413 };
	}

	try {
		const res = await fetch(`${API_URL}/generate-pdf`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ html, ...options }),
			signal: AbortSignal.timeout(RENDER_TIMEOUT_MS)
		});

		if (!res.ok) {
			const text = await res.text();

			switch (res.status) {
				case 400:
					return { success: false, error: text || 'Invalid request. Please check your HTML and options.', statusCode: 400 };
				case 413:
					return { success: false, error: 'Payload too large. Please reduce your HTML content size.', statusCode: 413 };
				case 429: {
					// Backend returns 429 for both rate-limiting (has retry-after) and concurrency capacity (no retry-after)
					const retryAfter = res.headers.get('retry-after');
					let parsed = retryAfter ? parseInt(retryAfter, 10) : undefined;
					if (!Number.isFinite(parsed)) {
						const match = text.match(/wait\s+(\d+)\s+second/i);
						parsed = match ? parseInt(match[1], 10) : undefined;
					}
					const isCapacity = !retryAfter && !Number.isFinite(parsed);
					return {
						success: false,
						error: text || (isCapacity ? 'Server is at capacity. Please try again shortly.' : 'Rate limited. Please wait before trying again.'),
						statusCode: 429,
						retryAfterSecs: Number.isFinite(parsed) ? parsed : undefined,
						isCapacity
					};
				}
				case 504:
					return { success: false, error: 'Render timed out. Try simplifying your HTML.', statusCode: 504 };
				default:
					return { success: false, error: text || `Server error (${res.status})`, statusCode: res.status };
			}
		}

		// Read rate limit reset from successful response headers
		const resetHeader = res.headers.get('x-ratelimit-reset');
		const rateLimitResetSecs = resetHeader ? parseInt(resetHeader, 10) : undefined;

		const blob = await res.blob();
		return { success: true, blob, statusCode: 200, rateLimitResetSecs: Number.isFinite(rateLimitResetSecs) ? rateLimitResetSecs : undefined };
	} catch (err) {
		if (err instanceof DOMException && err.name === 'TimeoutError') {
			return { success: false, error: 'Request timed out. Please try again.' };
		}
		if (err instanceof DOMException && err.name === 'AbortError') {
			return { success: false, error: 'Request was cancelled.' };
		}
		return {
			success: false,
			error: err instanceof Error ? err.message : 'Network error. Please check your connection.'
		};
	}
}

export function downloadBlob(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	setTimeout(() => URL.revokeObjectURL(url), BLOB_REVOKE_DELAY_MS);
}

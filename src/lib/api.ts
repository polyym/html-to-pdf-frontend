import { PUBLIC_API_URL } from '$env/static/public';

export const API_URL = PUBLIC_API_URL || 'http://localhost:3001';
export const isLocalApi = /localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0/.test(API_URL);

export type ApiStatus = 'checking' | 'online' | 'offline';

export async function checkApiHealth(): Promise<ApiStatus> {
	try {
		const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(5000) });
		return res.ok ? 'online' : 'offline';
	} catch {
		return 'offline';
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
}

export async function generatePdf(html: string, options: PdfOptions): Promise<GeneratePdfResult> {
	try {
		const res = await fetch(`${API_URL}/generate-pdf`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ html, ...options }),
			signal: AbortSignal.timeout(35_000)
		});

		if (!res.ok) {
			const text = await res.text();
			return { success: false, error: text || `Server error (${res.status})` };
		}

		const blob = await res.blob();
		return { success: true, blob };
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
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

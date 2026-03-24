import { PUBLIC_API_URL } from '$env/static/public';

export const API_URL = PUBLIC_API_URL || 'http://localhost:3001';
export const isLocalApi = API_URL.includes('localhost') || API_URL.includes('127.0.0.1');

export type ApiStatus = 'checking' | 'online' | 'offline';

export async function checkApiHealth(): Promise<ApiStatus> {
	try {
		const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(5000) });
		return res.ok ? 'online' : 'offline';
	} catch {
		return 'offline';
	}
}

export interface GeneratePdfResult {
	success: boolean;
	blob?: Blob;
	error?: string;
}

export async function generatePdf(html: string): Promise<GeneratePdfResult> {
	const res = await fetch(`${API_URL}/generate-pdf`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ html })
	});

	if (!res.ok) {
		const text = await res.text();
		return { success: false, error: text || `Server error (${res.status})` };
	}

	const blob = await res.blob();
	return { success: true, blob };
}

export function downloadBlob(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

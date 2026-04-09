export interface FileLoadResult {
	success: boolean;
	content?: string;
	fileName?: string;
	error?: string;
}

const VALID_EXTENSIONS = ['.html', '.htm'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB, matches backend limit

function isValidHtmlFile(name: string): boolean {
	return VALID_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));
}

export async function loadHtmlFile(file: File): Promise<FileLoadResult> {
	if (!isValidHtmlFile(file.name)) {
		return { success: false, error: 'Please use an .html or .htm file' };
	}

	if (file.size > MAX_FILE_SIZE_BYTES) {
		const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
		return { success: false, error: `File is too large (${sizeMB}MB). Maximum size is 5MB.` };
	}

	try {
		const content = await file.text();
		return { success: true, content, fileName: file.name };
	} catch {
		return { success: false, error: 'Failed to read file' };
	}
}

export function getFileFromInput(e: Event): File | null {
	const target = e.target as HTMLInputElement;
	return target.files?.[0] ?? null;
}

export function getFileFromDrop(e: DragEvent): File | null {
	e.preventDefault();
	return e.dataTransfer?.files?.[0] ?? null;
}

export function pdfFileName(htmlFileName: string): string {
	return htmlFileName ? htmlFileName.replace(/\.html?$/i, '.pdf') : 'document.pdf';
}

export interface FileLoadResult {
	success: boolean;
	content?: string;
	fileName?: string;
	error?: string;
}

const VALID_EXTENSIONS = ['.html', '.htm'];

function isValidHtmlFile(name: string): boolean {
	return VALID_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));
}

export function loadHtmlFile(file: File): Promise<FileLoadResult> {
	return new Promise((resolve) => {
		if (!isValidHtmlFile(file.name)) {
			resolve({ success: false, error: 'Please use an .html or .htm file' });
			return;
		}

		const reader = new FileReader();
		reader.onload = () => {
			resolve({ success: true, content: reader.result as string, fileName: file.name });
		};
		reader.onerror = () => {
			resolve({ success: false, error: 'Failed to read file' });
		};
		reader.readAsText(file);
	});
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

const SUPPORTED_MIME_PATTERNS: RegExp[] = [
    /^image\//i,
    /^application\/pdf$/i,
    /^text\/plain$/i,
];

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif", "heic", "heif"];
const VIDEO_EXTENSIONS = ["mp4", "mov", "mkv", "webm", "avi", "m4v", "mpg", "mpeg"];
const AUDIO_EXTENSIONS = ["mp3", "wav", "ogg", "m4a", "flac", "aac", "opus", "oga"];
const TEXT_EXTENSIONS = ["txt", "text"];
const PDF_EXTENSIONS = ["pdf"];

const EXTENSION_CATALOG = new Map<string, string>();
IMAGE_EXTENSIONS.forEach(ext => EXTENSION_CATALOG.set(ext, "image"));
VIDEO_EXTENSIONS.forEach(ext => EXTENSION_CATALOG.set(ext, "video"));
AUDIO_EXTENSIONS.forEach(ext => EXTENSION_CATALOG.set(ext, "audio"));
TEXT_EXTENSIONS.forEach(ext => EXTENSION_CATALOG.set(ext, "text"));
PDF_EXTENSIONS.forEach(ext => EXTENSION_CATALOG.set(ext, "pdf"));

export const SUPPORTED_ACCEPT_ATTRIBUTE = "image/*,application/pdf,text/plain";
export const SUPPORTED_TYPES_LABEL = "images, PDF, plain text";
export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; //10MB

export function isSupportedFileType(file: File): boolean {
    if (SUPPORTED_MIME_PATTERNS.some(pattern => pattern.test(file.type))) {
        return true;
    }

    const extension = getExtension(file.name);
    if (!extension) {
        return false;
    }
    return EXTENSION_CATALOG.has(extension);
}

export function getFileSignature(file: File): string {
    const safeType = file.type || "application/octet-stream";
    return `${file.name}::${file.size}::${safeType}::${file.lastModified}`;
}

export function formatFileListForToast(fileNames: string[]): string {
    if (fileNames.length === 1) {
        return fileNames[0];
    }
    return fileNames.map(name => `• ${name}`).join("\n");
}

function getExtension(name: string): string | undefined {
    if (!name.includes(".")) {
        return undefined;
    }
    return name.split(".").pop()?.toLowerCase();
}

export type AttachmentValidationFailureReason = "unsupported" | "mime-mismatch" | "too-large" | "absolute-too-large";

export interface AttachmentPolicy {
	extensions: string[];
	mimeTypes: string[];
	maxBytes: number;
	label: string;
}

export interface AttachmentValidationSuccess {
	ok: true;
	policy: AttachmentPolicy;
	extension: string;
}

export interface AttachmentValidationFailure {
	ok: false;
	reason: AttachmentValidationFailureReason;
	extension?: string;
	expectedMimeTypes?: string[];
	maxBytes?: number;
	message: string;
}

export type AttachmentValidationResult = AttachmentValidationSuccess | AttachmentValidationFailure;

const KIB = 1024;
const MIB = 1024 * 1024;

const TEXT_FILE_BYTES = 512 * KIB;
const PDF_FILE_BYTES = 1 * MIB;
const IMAGE_FILE_BYTES = 5 * MIB;

const ATTACHMENT_POLICIES: AttachmentPolicy[] = [
	{ extensions: ["txt"], mimeTypes: ["text/plain"], maxBytes: TEXT_FILE_BYTES, label: "TXT" },
	{ extensions: ["md"], mimeTypes: ["text/markdown", "text/plain"], maxBytes: TEXT_FILE_BYTES, label: "Markdown" },
	{ extensions: ["json"], mimeTypes: ["application/json"], maxBytes: TEXT_FILE_BYTES, label: "JSON" },
	{ extensions: ["pdf"], mimeTypes: ["application/pdf"], maxBytes: PDF_FILE_BYTES, label: "PDF" },
	{ extensions: ["jpg", "jpeg"], mimeTypes: ["image/jpeg"], maxBytes: IMAGE_FILE_BYTES, label: "JPEG" },
	{ extensions: ["png"], mimeTypes: ["image/png"], maxBytes: IMAGE_FILE_BYTES, label: "PNG" }
];

const POLICY_BY_EXTENSION = new Map<string, AttachmentPolicy>();
for (const policy of ATTACHMENT_POLICIES) {
	for (const extension of policy.extensions) {
		POLICY_BY_EXTENSION.set(extension, policy);
	}
}

export const SUPPORTED_ACCEPT_ATTRIBUTE =
	".txt,.md,.json,.pdf,.jpg,.jpeg,.png,text/plain,text/markdown,application/json,application/pdf,image/jpeg,image/png";
export const SUPPORTED_TYPES_LABEL = "TXT, Markdown, JSON, PDF, JPEG, and PNG files";
export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 10 * MIB; // 10MB absolute backstop

export function isSupportedFileType(file: File): boolean {
	return validateAttachmentFile(file).ok;
}

export function validateAttachmentFile(file: File): AttachmentValidationResult {
	const displayName = getDisplayName(file);
	const extension = getExtension(file.name);
	if (!extension) {
		return {
			ok: false,
			reason: "unsupported",
			message: `${displayName} has no supported file extension. Supported types: ${SUPPORTED_TYPES_LABEL}.`
		};
	}

	const policy = POLICY_BY_EXTENSION.get(extension);
	if (!policy) {
		return {
			ok: false,
			reason: "unsupported",
			extension,
			message: `${displayName} uses .${extension}, which is not supported. Supported types: ${SUPPORTED_TYPES_LABEL}.`
		};
	}

	const mimeType = file.type.trim().toLowerCase();
	if (!isUnknownMimeType(mimeType) && !policy.mimeTypes.includes(mimeType)) {
		return {
			ok: false,
			reason: "mime-mismatch",
			extension,
			expectedMimeTypes: policy.mimeTypes,
			message: `${displayName} must be a .${extension} file with ${formatMimeTypes(policy.mimeTypes)}.`
		};
	}

	if (file.size > MAX_ATTACHMENT_BYTES) {
		return {
			ok: false,
			reason: "absolute-too-large",
			extension,
			maxBytes: MAX_ATTACHMENT_BYTES,
			message: `${displayName} exceeds the 10 MB attachment cap.`
		};
	}

	if (file.size > policy.maxBytes) {
		return {
			ok: false,
			reason: "too-large",
			extension,
			maxBytes: policy.maxBytes,
			message: `${displayName} exceeds the ${formatBytes(policy.maxBytes)} limit for ${policy.label} files.`
		};
	}

	return { ok: true, policy, extension };
}

export function getAttachmentValidationSummary(files: ArrayLike<File> | Iterable<File>): {
	ok: boolean;
	errors: AttachmentValidationFailure[];
	tooMany: boolean;
} {
	const fileList = Array.from(files);
	const errors = fileList
		.map(validateAttachmentFile)
		.filter((result): result is AttachmentValidationFailure => !result.ok);
	return {
		ok: fileList.length <= MAX_ATTACHMENTS && errors.length === 0,
		errors,
		tooMany: fileList.length > MAX_ATTACHMENTS
	};
}

export function getFileSignature(file: File): string {
	const safeType = file.type || "application/octet-stream";
	return `${file.name}::${file.size}::${safeType}::${file.lastModified}`;
}

export function formatFileListForToast(fileNames: string[]): string {
	if (fileNames.length === 1) {
		return fileNames[0];
	}
	return fileNames.map((name) => `• ${name}`).join("\n");
}

export function formatBytes(bytes: number): string {
	if (bytes % MIB === 0) {
		return `${bytes / MIB} MB`;
	}
	if (bytes % KIB === 0) {
		return `${bytes / KIB} KB`;
	}
	return `${bytes} bytes`;
}

function getDisplayName(file: File): string {
	return file.name?.trim() ? file.name : "Unnamed file";
}

function getExtension(name: string): string | undefined {
	if (!name.includes(".")) {
		return undefined;
	}
	return name.split(".").pop()?.toLowerCase();
}

function formatMimeTypes(mimeTypes: string[]): string {
	if (mimeTypes.length === 1) {
		return mimeTypes[0];
	}
	return mimeTypes.slice(0, -1).join(", ") + " or " + mimeTypes[mimeTypes.length - 1];
}

function isUnknownMimeType(mimeType: string): boolean {
	return mimeType === "" || mimeType === "application/octet-stream";
}

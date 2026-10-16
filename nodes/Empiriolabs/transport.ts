import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	IN8nHttpFullResponse,
	IPollFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleep } from 'n8n-workflow';

export const API_BASE_URL = 'https://api.empiriolabs.ai/v1';

export const CREDENTIAL_NAME = 'empirioLabsApi';

export type RequestContext = IExecuteFunctions | ILoadOptionsFunctions | IPollFunctions;

export function isDataObject(value: unknown): value is IDataObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Sends an authenticated JSON request to the EmpirioLabs AI API and returns the parsed body.
 */
export async function apiRequest(
	this: RequestContext,
	method: IHttpRequestMethods,
	endpoint: string,
	body?: IDataObject | Buffer,
	qs?: IDataObject,
	overrides: Partial<IHttpRequestOptions> = {},
): Promise<IDataObject> {
	const options: IHttpRequestOptions = {
		method,
		baseURL: API_BASE_URL,
		url: endpoint,
		json: true,
		sendCredentialsOnCrossOriginRedirect: false,
		...overrides,
	};
	if (body !== undefined) {
		options.body = body;
	}
	if (qs !== undefined && Object.keys(qs).length > 0) {
		options.qs = qs;
	}

	try {
		const response: unknown = await this.helpers.httpRequestWithAuthentication.call(
			this,
			CREDENTIAL_NAME,
			options,
		);
		return isDataObject(response) ? response : { data: response as IDataObject[] };
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject);
	}
}

/**
 * Sends an authenticated request and returns the raw response (status, headers and body as bytes).
 * Used by endpoints that can answer with either JSON or a file, such as text to speech.
 */
export async function apiRequestRaw(
	this: IExecuteFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	body: IDataObject,
	itemIndex: number,
): Promise<{ data: Buffer; contentType: string }> {
	let response: IN8nHttpFullResponse;
	try {
		response = (await this.helpers.httpRequestWithAuthentication.call(this, CREDENTIAL_NAME, {
			method,
			baseURL: API_BASE_URL,
			url: endpoint,
			body,
			headers: { 'Content-Type': 'application/json', Accept: '*/*' },
			encoding: 'arraybuffer',
			returnFullResponse: true,
			ignoreHttpStatusErrors: true,
			sendCredentialsOnCrossOriginRedirect: false,
		})) as IN8nHttpFullResponse;
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex });
	}

	const data = toBuffer(response.body);
	const contentType = headerValue(response.headers, 'content-type');

	if (response.statusCode >= 400) {
		const parsed = parseJson(data.toString('utf8'));
		const errorBody: JsonObject = isDataObject(parsed)
			? (parsed as JsonObject)
			: { message: data.toString('utf8').slice(0, 500) };
		throw new NodeApiError(this.getNode(), errorBody, {
			httpCode: String(response.statusCode),
			itemIndex,
		});
	}

	return { data, contentType };
}

export function toBuffer(body: unknown): Buffer {
	if (Buffer.isBuffer(body)) {
		return body;
	}
	if (body instanceof ArrayBuffer) {
		return Buffer.from(body);
	}
	if (ArrayBuffer.isView(body)) {
		return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
	}
	if (typeof body === 'string') {
		return Buffer.from(body, 'utf8');
	}
	return Buffer.from(JSON.stringify(body ?? ''), 'utf8');
}

export function headerValue(headers: IDataObject | undefined, name: string): string {
	if (!headers) {
		return '';
	}
	const key = Object.keys(headers).find((header) => header.toLowerCase() === name);
	const value = key === undefined ? undefined : headers[key];
	if (Array.isArray(value)) {
		return String(value[0] ?? '');
	}
	return value === undefined || value === null ? '' : String(value);
}

export function parseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

/**
 * Reads a JSON object parameter that can be given as an object or as a JSON string.
 */
export function parseJsonObjectParameter(
	this: IExecuteFunctions,
	value: unknown,
	displayName: string,
	itemIndex: number,
): IDataObject {
	if (value === undefined || value === null || value === '') {
		return {};
	}
	const parsed = typeof value === 'string' ? parseJson(value) : value;
	if (!isDataObject(parsed)) {
		throw new NodeOperationError(this.getNode(), `${displayName} must be a JSON object`, {
			itemIndex,
			description: 'Enter an object such as {"seed": 42}, or leave the field empty',
		});
	}
	return parsed;
}

const SUCCESS_STATUSES = ['completed', 'succeeded', 'success'];
const FAILURE_STATUSES = ['failed', 'cancelled', 'canceled', 'abandoned', 'error', 'expired'];

export function normalizeJobStatus(status: unknown): string {
	const value = String(status ?? '').toLowerCase();
	if (SUCCESS_STATUSES.includes(value)) {
		return 'completed';
	}
	if (value === 'canceled') {
		return 'cancelled';
	}
	if (value === 'abandoned' || value === 'error' || value === 'expired') {
		return 'failed';
	}
	return value;
}

export function isJobEnvelope(response: IDataObject): boolean {
	return (
		typeof response.job_id === 'string' && response.job_id !== '' && !Array.isArray(response.data)
	);
}

export function jobErrorMessage(job: IDataObject): string | undefined {
	const error = job.error;
	if (typeof error === 'string') {
		return error;
	}
	if (isDataObject(error)) {
		if (typeof error.message === 'string') {
			return error.message;
		}
		if (isDataObject(error.error) && typeof error.error.message === 'string') {
			return error.error.message;
		}
	}
	return undefined;
}

/**
 * Polls GET /jobs/{id} until the job reaches a final status or the timeout passes.
 */
export async function waitForJob(
	this: IExecuteFunctions,
	jobId: string,
	timeoutSeconds: number,
	itemIndex: number,
	intervalSeconds = 5,
): Promise<IDataObject> {
	const deadline = Date.now() + Math.max(timeoutSeconds, 1) * 1000;
	const cancelSignal =
		typeof this.getExecutionCancelSignal === 'function'
			? this.getExecutionCancelSignal()
			: undefined;

	for (;;) {
		const job = await apiRequest.call(this, 'GET', `/jobs/${encodeURIComponent(jobId)}`);
		const status = normalizeJobStatus(job.status);

		if (status === 'completed') {
			return job;
		}
		if (FAILURE_STATUSES.includes(status)) {
			throw new NodeOperationError(this.getNode(), `Job ${jobId} ended with status "${status}"`, {
				itemIndex,
				description: jobErrorMessage(job) ?? 'Check the inputs and model, then run the node again',
			});
		}

		const remaining = deadline - Date.now();
		if (remaining <= 0) {
			throw new NodeOperationError(
				this.getNode(),
				`Job ${jobId} is still running after ${timeoutSeconds} seconds`,
				{
					itemIndex,
					description:
						'Increase the timeout, or get the result later with the Job resource and the Get operation',
				},
			);
		}
		if (cancelSignal?.aborted) {
			throw new NodeOperationError(
				this.getNode(),
				'The execution was stopped while waiting for the job',
				{
					itemIndex,
				},
			);
		}

		await sleep(Math.min(intervalSeconds * 1000, remaining));
	}
}

export interface MediaReference {
	url?: string;
	base64?: string;
	mimeType?: string;
}

const URL_KEYS = ['url', 'video_url', 'audio_url', 'image_url', 'file_url', 'output_url'];
const BASE64_KEYS = ['b64_json', 'b64', 'base64', 'base64_data', 'audio_base64', 'audio'];
const LIST_KEYS = [
	'data',
	'images',
	'videos',
	'audios',
	'outputs',
	'output',
	'output_urls',
	'urls',
];

function referenceFromValue(value: unknown): MediaReference | undefined {
	if (typeof value === 'string') {
		if (/^https?:\/\//i.test(value)) {
			return { url: value };
		}
		if (value.startsWith('data:')) {
			return { base64: value };
		}
		return undefined;
	}
	if (!isDataObject(value)) {
		return undefined;
	}
	for (const key of URL_KEYS) {
		const candidate = value[key];
		if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate)) {
			return {
				url: candidate,
				mimeType: typeof value.mime_type === 'string' ? value.mime_type : undefined,
			};
		}
	}
	for (const key of BASE64_KEYS) {
		const candidate = value[key];
		if (typeof candidate === 'string' && candidate.length > 0) {
			return {
				base64: candidate,
				mimeType: typeof value.mime_type === 'string' ? value.mime_type : undefined,
			};
		}
	}
	return undefined;
}

/**
 * Finds the generated files in an API or job result, whether they are URLs or base64 data.
 */
export function extractMediaReferences(payload: unknown): MediaReference[] {
	if (!isDataObject(payload)) {
		return [];
	}
	for (const key of LIST_KEYS) {
		const list = payload[key];
		if (Array.isArray(list)) {
			const references = list
				.map((entry) => referenceFromValue(entry))
				.filter((entry): entry is MediaReference => entry !== undefined);
			if (references.length > 0) {
				return references;
			}
		}
		if (isDataObject(list)) {
			const nested = extractMediaReferences(list);
			if (nested.length > 0) {
				return nested;
			}
		}
	}
	const single = referenceFromValue(payload);
	if (single) {
		return [single];
	}
	if (isDataObject(payload.result)) {
		return extractMediaReferences(payload.result);
	}
	return [];
}

const EXTENSIONS: Record<string, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/webp': 'webp',
	'image/gif': 'gif',
	'video/mp4': 'mp4',
	'video/webm': 'webm',
	'video/quicktime': 'mov',
	'audio/mpeg': 'mp3',
	'audio/mp3': 'mp3',
	'audio/wav': 'wav',
	'audio/x-wav': 'wav',
	'audio/wave': 'wav',
	'audio/ogg': 'ogg',
	'audio/flac': 'flac',
	'audio/aac': 'aac',
	'audio/mp4': 'm4a',
	'audio/pcm': 'pcm',
	'model/gltf-binary': 'glb',
};

export function extensionForMimeType(mimeType: string | undefined): string | undefined {
	if (!mimeType) {
		return undefined;
	}
	return EXTENSIONS[mimeType.split(';')[0].trim().toLowerCase()];
}

function fileNameFromUrl(url: string): string | undefined {
	const path = url.split(/[?#]/)[0];
	const last = path.substring(path.lastIndexOf('/') + 1);
	if (!last || !last.includes('.')) {
		return undefined;
	}
	try {
		return decodeURIComponent(last);
	} catch {
		return last;
	}
}

export interface MediaFile {
	data: Buffer;
	mimeType?: string;
	fileName?: string;
}

/** Picks a file extension from the downloaded file name, then the MIME type, then the fallback. */
export function fileExtension(
	file: MediaFile,
	mimeType: string | undefined,
	fallback: string,
): string {
	const fromName = /\.([a-z0-9]{1,5})$/i.exec(file.fileName ?? '');
	return (fromName?.[1] ?? extensionForMimeType(mimeType) ?? fallback).toLowerCase();
}

export function binaryFieldName(options: IDataObject): string {
	const value = options.binaryPropertyOutput;
	return typeof value === 'string' && value.trim() !== '' ? value.trim() : 'data';
}

/** Converts a field value to the text form used in a multipart form. */
export function formFieldValue(value: unknown): string {
	if (typeof value === 'string') {
		return value;
	}
	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}
	return JSON.stringify(value);
}

function safeHeaderText(value: string): string {
	return value.replace(/[\r\n"]/g, '_');
}

/**
 * Builds a multipart/form-data body with text fields and one file.
 */
export function buildMultipartBody(
	fields: Record<string, string>,
	file: { fieldName: string; fileName: string; mimeType: string; data: Buffer },
): { body: Buffer; contentType: string } {
	const boundary = `----EmpirioLabsN8n${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
	const chunks: Buffer[] = [];
	for (const [name, value] of Object.entries(fields)) {
		chunks.push(
			Buffer.from(
				`--${boundary}\r\nContent-Disposition: form-data; name="${safeHeaderText(name)}"\r\n\r\n${value}\r\n`,
				'utf8',
			),
		);
	}
	chunks.push(
		Buffer.from(
			`--${boundary}\r\nContent-Disposition: form-data; name="${safeHeaderText(file.fieldName)}"; filename="${safeHeaderText(file.fileName)}"\r\nContent-Type: ${safeHeaderText(file.mimeType)}\r\n\r\n`,
			'utf8',
		),
	);
	chunks.push(file.data);
	chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'));
	return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

const AUDIO_FORMAT_MIME_TYPES: Record<string, string> = {
	mp3: 'audio/mpeg',
	wav: 'audio/wav',
	ogg: 'audio/ogg',
	opus: 'audio/ogg',
	flac: 'audio/flac',
	aac: 'audio/aac',
	m4a: 'audio/mp4',
	pcm: 'audio/pcm',
};

export function mimeTypeForAudioFormat(format: unknown): string | undefined {
	return typeof format === 'string' ? AUDIO_FORMAT_MIME_TYPES[format.toLowerCase()] : undefined;
}

/**
 * Turns a media reference into file bytes: decodes base64 data or downloads the URL.
 * Generated media URLs are signed, so the download does not send the API key.
 */
export async function resolveMediaReference(
	this: IExecuteFunctions,
	reference: MediaReference,
	itemIndex: number,
): Promise<MediaFile> {
	if (reference.base64) {
		let encoded = reference.base64;
		let mimeType = reference.mimeType;
		const dataUri = /^data:([^;,]+)?(;base64)?,/i.exec(encoded);
		if (dataUri) {
			mimeType = mimeType ?? dataUri[1];
			encoded = encoded.slice(dataUri[0].length);
		}
		return { data: Buffer.from(encoded, 'base64'), mimeType };
	}

	if (!reference.url) {
		throw new NodeOperationError(this.getNode(), 'The result does not contain a file', {
			itemIndex,
		});
	}

	let response: IN8nHttpFullResponse;
	try {
		response = (await this.helpers.httpRequest({
			method: 'GET',
			url: reference.url,
			encoding: 'arraybuffer',
			returnFullResponse: true,
		})) as IN8nHttpFullResponse;
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject, {
			itemIndex,
			message: 'The generated file could not be downloaded',
			description: 'Try again, or use the URL in the output to download the file later',
		});
	}

	const contentType = headerValue(response.headers, 'content-type').split(';')[0].trim();
	return {
		data: toBuffer(response.body),
		mimeType: contentType || reference.mimeType,
		fileName: fileNameFromUrl(reference.url),
	};
}

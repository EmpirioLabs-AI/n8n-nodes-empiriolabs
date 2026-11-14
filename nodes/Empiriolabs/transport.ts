import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	IN8nHttpFullResponse,
	INodeExecutionData,
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
 * The message of an error body: an object that holds only `error`, with a message. The answer
 * to a request that ran for several minutes can carry its error this way, with a success status.
 */
export function errorBodyMessage(response: IDataObject): string | undefined {
	const keys = Object.keys(response);
	if (keys.length !== 1 || keys[0] !== 'error' || !isDataObject(response.error)) {
		return undefined;
	}
	const { message } = response.error;
	return typeof message === 'string' && message !== '' ? message : undefined;
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

	let response: unknown;
	try {
		response = await this.helpers.httpRequestWithAuthentication.call(
			this,
			CREDENTIAL_NAME,
			options,
		);
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject);
	}
	if (!isDataObject(response)) {
		return { data: response as IDataObject[] };
	}
	const message = errorBodyMessage(response);
	if (message !== undefined) {
		throw new NodeApiError(this.getNode(), response as JsonObject, { message });
	}
	return response;
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

/** Reads a JSON parameter given as a value or as JSON text. Unreadable text gives undefined. */
export function readJsonParameter(value: unknown): unknown {
	return typeof value === 'string' ? parseJson(value) : value;
}

/** The value of a resource locator parameter, given as its object or as the extracted text. */
export function locatorValue(value: unknown): string {
	if (isDataObject(value)) {
		return String(value.value ?? '').trim();
	}
	return typeof value === 'string' ? value.trim() : '';
}

/** The entries of a list response, which the API returns in `data`. */
export function listEntries(response: IDataObject): IDataObject[] {
	return Array.isArray(response.data) ? (response.data as unknown[]).filter(isDataObject) : [];
}

/** Splits text into its lines, trimmed, without the empty ones. */
export function splitLines(value: unknown): string[] {
	if (typeof value !== 'string') {
		return [];
	}
	return value
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line !== '');
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

/** The first MIME type listed for a file extension, such as "audio/mpeg" for "mp3". */
export function mimeTypeForExtension(extension: string | undefined): string | undefined {
	if (!extension) {
		return undefined;
	}
	const wanted = extension.toLowerCase();
	return Object.keys(EXTENSIONS).find((mimeType) => EXTENSIONS[mimeType] === wanted);
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

const IMAGE_EXTENSION_MIME_TYPES: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	webp: 'image/webp',
	gif: 'image/gif',
	bmp: 'image/bmp',
	tif: 'image/tiff',
	tiff: 'image/tiff',
	avif: 'image/avif',
};

/**
 * Reads an image from a binary field of the input item as a base64 data URI.
 */
export async function imageDataUri(
	this: IExecuteFunctions,
	itemIndex: number,
	binaryPropertyName: string,
): Promise<string> {
	const binaryData = this.helpers.assertBinaryData(itemIndex, binaryPropertyName);
	const declared = String(binaryData.mimeType ?? '')
		.split(';')[0]
		.trim()
		.toLowerCase();
	const extension = String(binaryData.fileExtension ?? '').toLowerCase();
	const mimeType = declared.startsWith('image/') ? declared : IMAGE_EXTENSION_MIME_TYPES[extension];
	if (!mimeType) {
		throw new NodeOperationError(this.getNode(), 'The file is not an image', {
			itemIndex,
			description: `The field "${binaryPropertyName}" holds a file of type "${declared || 'unknown'}". Use an image such as a PNG, JPEG or WebP file.`,
		});
	}
	const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
	return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

/** Applies the Return All and Limit parameters of a Get Many operation to a list. */
export function limitEntries(
	this: IExecuteFunctions,
	entries: IDataObject[],
	itemIndex: number,
): IDataObject[] {
	const returnAll = this.getNodeParameter('returnAll', itemIndex, false) as boolean;
	if (returnAll) {
		return entries;
	}
	const limit = this.getNodeParameter('limit', itemIndex, 50) as number;
	return entries.slice(0, limit);
}

/** The query of a template list request, from the Filters of a Get Many Templates operation. */
export function templateListQuery(filters: IDataObject): IDataObject {
	const qs: IDataObject = {};
	if (typeof filters.category === 'string' && filters.category.trim() !== '') {
		qs.category = filters.category.trim();
	}
	if (typeof filters.model === 'string' && filters.model !== '') {
		qs.model = filters.model;
	}
	if (filters.featured === true) {
		qs.featured = true;
	}
	return qs;
}

export interface FileNaming {
	/** The file name without its extension, such as "audio". */
	baseName: string;
	/** The MIME type to use when the download does not name one. */
	mimeType: string;
	/** The extension to use when neither the file name nor the MIME type gives one. */
	extension: string;
}

/**
 * Downloads every file of a finished job. Returns one item per file, each with the job as JSON
 * and the file in the binary field. A result without files gives no items.
 */
export async function jobFileItems(
	this: IExecuteFunctions,
	job: IDataObject,
	itemIndex: number,
	field: string,
	naming: FileNaming,
): Promise<INodeExecutionData[]> {
	const references = extractMediaReferences(isDataObject(job.result) ? job.result : job);
	const items: INodeExecutionData[] = [];
	for (let index = 0; index < references.length; index++) {
		const file = await resolveMediaReference.call(this, references[index], itemIndex);
		const namedExtension = /\.([a-z0-9]{1,5})$/i.exec(file.fileName ?? '')?.[1];
		const specific =
			file.mimeType && file.mimeType !== 'application/octet-stream' ? file.mimeType : undefined;
		const mimeType =
			specific ?? mimeTypeForExtension(namedExtension) ?? file.mimeType ?? naming.mimeType;
		const suffix = references.length > 1 ? `-${index + 1}` : '';
		const extension = fileExtension(file, mimeType, naming.extension);
		const binary = await this.helpers.prepareBinaryData(
			file.data,
			`${naming.baseName}${suffix}.${extension}`,
			mimeType,
		);
		// Each item gets its own copy of the job, so a later node can change one without the others.
		items.push({ json: { ...job }, binary: { [field]: binary }, pairedItem: { item: itemIndex } });
	}
	return items;
}

export interface StartedJobSettings {
	/** Whether to wait for the job instead of returning it right away. */
	wait: boolean;
	/** How long to wait for the job, in seconds. */
	timeoutSeconds: number;
	/** How often to ask for the job status, in seconds. */
	pollSeconds: number;
	/** Whether to download the files of the finished job. */
	download: boolean;
	/** The binary field for the downloaded files. */
	field: string;
	naming: FileNaming;
	/** The display name of the download toggle, named when the result holds no file. */
	downloadToggle: string;
}

/**
 * Shapes the output of an operation that starts a job: the job as the API returned it, the
 * finished job, or one item per downloaded file with the finished job as JSON.
 */
export async function startedJobItems(
	this: IExecuteFunctions,
	started: IDataObject,
	itemIndex: number,
	settings: StartedJobSettings,
): Promise<INodeExecutionData[]> {
	if (!settings.wait) {
		return [{ json: started, pairedItem: { item: itemIndex } }];
	}

	let job: IDataObject;
	if (typeof started.job_id === 'string' && started.job_id !== '') {
		job = await waitForJob.call(
			this,
			started.job_id,
			settings.timeoutSeconds,
			itemIndex,
			settings.pollSeconds,
		);
	} else if (extractMediaReferences(started).length > 0) {
		job = started;
	} else {
		throw new NodeOperationError(this.getNode(), 'The response did not include a job ID', {
			itemIndex,
			description: 'Try again, or turn off Wait for Completion to see the full response',
		});
	}

	if (!settings.download) {
		return [{ json: job, pairedItem: { item: itemIndex } }];
	}
	const items = await jobFileItems.call(this, job, itemIndex, settings.field, settings.naming);
	if (items.length === 0) {
		throw new NodeOperationError(this.getNode(), 'The finished job did not include a file', {
			itemIndex,
			description: `Turn off ${settings.downloadToggle} to return the job result as JSON`,
		});
	}
	return items;
}

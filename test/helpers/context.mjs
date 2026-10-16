// Minimal stand-ins for the n8n execution contexts the nodes use. They record
// every HTTP request so tests can assert on the exact request the node builds.
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function loadDist(relativePath) {
	return require(path.join(root, 'dist', relativePath));
}

/** The same n8n-workflow instance the built nodes load, for instanceof checks. */
export const n8nWorkflow = require('n8n-workflow');

function readPath(source, dottedPath) {
	return dottedPath
		.split('.')
		.reduce((value, key) => (value == null ? undefined : value[key]), source);
}

/**
 * Builds a fake IExecuteFunctions.
 * `parameters` is either one object used for every item or an array with one object per item.
 * `respond(request, calls)` returns the response for each authenticated request.
 * `download(request)` returns { body, headers } for unauthenticated media downloads.
 */
export function createExecuteContext({
	parameters,
	items,
	respond,
	download,
	continueOnFail = false,
	binary = {},
}) {
	const inputItems = items ?? [{ json: {}, binary }];
	const calls = [];
	const downloads = [];
	const node = {
		name: 'EmpirioLabs AI',
		type: 'n8n-nodes-empiriolabs.empiriolabs',
		typeVersion: 1,
		parameters: {},
	};

	const context = {
		calls,
		downloads,
		getInputData: () => inputItems,
		getNode: () => node,
		continueOnFail: () => continueOnFail,
		getExecutionCancelSignal: () => undefined,
		getNodeParameter(name, itemIndex, fallback) {
			const source = Array.isArray(parameters) ? parameters[itemIndex] : parameters;
			const value = readPath(source, name);
			if (value === undefined) {
				if (arguments.length >= 3) {
					return fallback;
				}
				throw new Error(`Missing test parameter "${name}"`);
			}
			return value;
		},
		helpers: {
			async httpRequestWithAuthentication(credentialName, request) {
				calls.push({ credentialName, ...request });
				return await respond(request, calls);
			},
			async httpRequest(request) {
				downloads.push(request);
				if (!download) {
					throw new Error(`Unexpected download of ${request.url}`);
				}
				const { body, headers = {}, statusCode = 200 } = await download(request);
				return request.returnFullResponse ? { body, headers, statusCode } : body;
			},
			async prepareBinaryData(data, fileName, mimeType) {
				const extension =
					fileName && fileName.includes('.') ? fileName.split('.').pop() : undefined;
				return {
					data: Buffer.from(data).toString('base64'),
					mimeType,
					fileName,
					fileExtension: extension,
				};
			},
			assertBinaryData(itemIndex, propertyName) {
				const entry = inputItems[itemIndex]?.binary?.[propertyName];
				if (!entry) {
					throw new Error(`No binary data in field "${propertyName}"`);
				}
				return entry;
			},
			async getBinaryDataBuffer(itemIndex, propertyName) {
				const entry = inputItems[itemIndex]?.binary?.[propertyName];
				return Buffer.from(entry.data, 'base64');
			},
			returnJsonArray(values) {
				return (Array.isArray(values) ? values : [values]).map((json) => ({ json }));
			},
		},
	};
	return context;
}

/** Builds a fake IPollFunctions with persistent static data across calls. */
export function createPollContext({ parameters, respond, mode = 'trigger', staticData = {} }) {
	const calls = [];
	return {
		calls,
		staticData,
		getMode: () => mode,
		getNode: () => ({
			name: 'EmpirioLabs AI Trigger',
			type: 'n8n-nodes-empiriolabs.empiriolabsTrigger',
			typeVersion: 1,
		}),
		getNodeParameter(name, fallback) {
			const value = readPath(parameters, name);
			return value === undefined ? fallback : value;
		},
		getWorkflowStaticData: () => staticData,
		helpers: {
			async httpRequestWithAuthentication(credentialName, request) {
				calls.push({ credentialName, ...request });
				return await respond(request, calls);
			},
			returnJsonArray(values) {
				return (Array.isArray(values) ? values : [values]).map((json) => ({ json }));
			},
		},
	};
}

/** Builds a fake ILoadOptionsFunctions. */
export function createLoadOptionsContext({ currentParameters = {}, respond }) {
	const calls = [];
	return {
		calls,
		getNode: () => ({
			name: 'EmpirioLabs AI',
			type: 'n8n-nodes-empiriolabs.empiriolabs',
			typeVersion: 1,
		}),
		getCurrentNodeParameter: (name) => currentParameters[name],
		helpers: {
			async httpRequestWithAuthentication(credentialName, request) {
				calls.push({ credentialName, ...request });
				return await respond(request, calls);
			},
		},
	};
}

export const CATALOG_FIXTURE = {
	object: 'list',
	categories: [
		{ name: 'Text Generation', slug: 'text', order: 1 },
		{ name: 'Image Generation', slug: 'image', order: 2 },
		{ name: 'Video Generation', slug: 'video', order: 3 },
	],
	data: [
		{
			id: 'zeta-chat',
			display_name: 'Zeta Chat',
			category: 'text',
			status: 'available',
			description: 'A chat model.',
			supported_endpoints: ['POST /v1/chat/completions', 'POST /v1/responses'],
		},
		{
			id: 'alpha-chat',
			display_name: 'Alpha Chat',
			category: 'text',
			status: 'available',
			description: 'Another chat model.',
			deprecated: true,
			deprecation_date: '2026-12-01',
			supported_endpoints: ['POST /v1/chat/completions'],
		},
		{
			id: 'omni-speech',
			display_name: 'Omni Speech',
			category: 'text',
			status: 'available',
			supported_endpoints: ['POST /v1/chat/completions', 'POST /v1/audio/speech'],
			supported_parameters: [
				{ name: 'input', type: 'string' },
				{ name: 'voice', type: 'enum', options: ['Kore', 'Puck', 'Kore'] },
			],
		},
		{
			id: 'pixel-image',
			display_name: 'Pixel Image',
			category: 'image',
			status: 'available',
			supported_endpoints: ['POST /v1/images/generations'],
		},
		{
			id: 'reel-video',
			display_name: 'Reel Video',
			category: 'video',
			status: 'available',
			supported_endpoints: ['POST /v1/videos/generations'],
		},
		{
			id: 'stream-asr',
			display_name: 'Stream ASR',
			category: 'transcription',
			status: 'available',
			supported_endpoints: ['WEBSOCKET /v1/realtime'],
		},
		{
			id: 'batch-asr',
			display_name: 'Batch ASR',
			category: 'transcription',
			status: 'available',
			supported_endpoints: ['POST /v1/audio/transcriptions'],
		},
		{
			id: 'legacy-embed',
			display_name: 'Legacy Embed',
			category: 'embedding',
			status: 'available',
		},
		{
			id: 'retired-chat',
			display_name: 'Retired Chat',
			category: 'text',
			status: 'unavailable',
			supported_endpoints: ['POST /v1/chat/completions'],
		},
	],
};

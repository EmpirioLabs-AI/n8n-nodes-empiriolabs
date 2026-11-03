// Opt-in live check against the real EmpirioLabs AI API.
//
//   EMPIRIOLABS_LIVE=1 EMPIRIOLABS_API_KEY=... npm run test:live
//
// It makes these requests: the credential test (GET /v1/account/usage?limit=1),
// the public model catalog (GET /v1/models), one short chat completion on the
// cheapest chat model in the catalog (override with EMPIRIOLABS_LIVE_MODEL), one
// page read from test/fixtures/invoice.png (override the model with
// EMPIRIOLABS_LIVE_OCR_MODEL) and one web search (EMPIRIOLABS_LIVE_SEARCH_MODEL).
// The chat completion, the page read and the search are billed. The API key is never printed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createExecuteContext, createLoadOptionsContext, loadDist } from '../helpers/context.mjs';

const apiKey = process.env.EMPIRIOLABS_API_KEY ?? '';
const skip =
	process.env.EMPIRIOLABS_LIVE !== '1'
		? 'set EMPIRIOLABS_LIVE=1 to run the live checks'
		: apiKey === ''
			? 'EMPIRIOLABS_API_KEY is not set'
			: false;

const { EmpirioLabsApi } = loadDist('credentials/EmpirioLabsApi.credentials.js');
const { Empiriolabs } = loadDist('nodes/Empiriolabs/Empiriolabs.node.js');
const credential = new EmpirioLabsApi();

/** Resolves the credential's generic authentication the way n8n does for this credential. */
function authenticationHeaders() {
	const headers = {};
	for (const [name, template] of Object.entries(credential.authenticate.properties.headers)) {
		headers[name] = String(template)
			.replace(/^=/, '')
			.replace(/\{\{\s*\$credentials\.apiKey\s*\}\}/g, apiKey);
	}
	return headers;
}

let catalogCache;

/** Sends a request built by the node, with the credential applied, using fetch. */
async function send(request, { authenticate = true } = {}) {
	const url = new URL(
		/^https?:\/\//.test(request.url) ? request.url : `${request.baseURL}${request.url}`,
	);
	for (const [key, value] of Object.entries(request.qs ?? {})) {
		url.searchParams.set(key, String(value));
	}
	if (url.pathname === '/v1/models' && request.method !== 'POST' && catalogCache) {
		return catalogCache;
	}

	const headers = { ...(request.headers ?? {}), ...(authenticate ? authenticationHeaders() : {}) };
	let body;
	if (request.body !== undefined) {
		if (Buffer.isBuffer(request.body)) {
			body = request.body;
		} else {
			body = JSON.stringify(request.body);
			headers['Content-Type'] ??= 'application/json';
		}
	}
	if (request.json) {
		headers.Accept ??= 'application/json';
	}

	const response = await fetch(url, {
		method: request.method ?? 'GET',
		headers,
		body,
		redirect: 'error',
	});
	const bytes = Buffer.from(await response.arrayBuffer());
	if (response.status >= 400 && !request.ignoreHttpStatusErrors) {
		throw Object.assign(
			new Error(
				`HTTP ${response.status} from ${url.pathname}: ${bytes.toString('utf8').slice(0, 300)}`,
			),
			{
				httpCode: String(response.status),
			},
		);
	}
	const parsed =
		request.encoding === 'arraybuffer' ? bytes : JSON.parse(bytes.toString('utf8') || 'null');
	if (url.pathname === '/v1/models') {
		catalogCache = parsed;
	}
	return request.returnFullResponse
		? { statusCode: response.status, headers: Object.fromEntries(response.headers), body: parsed }
		: parsed;
}

function priceOf(model) {
	const pricing = Array.isArray(model.pricing) ? model.pricing[0] : model.pricing;
	const prompt = Number(pricing?.prompt);
	const completion = Number(pricing?.completion);
	return Number.isFinite(prompt) && Number.isFinite(completion) && prompt > 0 && completion > 0
		? prompt + completion
		: undefined;
}

function cheapestChatModel(catalog) {
	const candidates = catalog.data
		.filter((model) => (model.supported_endpoints ?? []).includes('POST /v1/chat/completions'))
		.filter((model) => model.category === 'text' && !model.deprecated)
		.filter((model) => model.status === undefined || model.status === 'available')
		.map((model) => ({ model, price: priceOf(model) }))
		.filter((entry) => entry.price !== undefined)
		// Prefer models without a reasoning phase so a short reply fits in a few tokens.
		.sort(
			(a, b) =>
				Number((a.model.features ?? []).includes('reasoning')) -
					Number((b.model.features ?? []).includes('reasoning')) || a.price - b.price,
		);
	assert.ok(candidates.length > 0, 'the catalog lists at least one priced chat model');
	return candidates[0].model.id;
}

describe('live EmpirioLabs AI API', { skip }, () => {
	it('accepts the API key through the credential test request', async () => {
		const { baseURL, url, method, qs } = credential.test.request;
		const response = await send({ baseURL, url, method, qs, json: true, returnFullResponse: true });
		assert.equal(response.statusCode, 200);
		assert.equal(typeof response.body, 'object');
		console.log(`credential test: HTTP ${response.statusCode}`);
	});

	it('runs one chat completion through the node', async () => {
		const catalog = await send(
			{ baseURL: 'https://api.empiriolabs.ai/v1', url: '/models', method: 'GET', json: true },
			{ authenticate: false },
		);
		const model = process.env.EMPIRIOLABS_LIVE_MODEL || cheapestChatModel(catalog);

		// The model dropdown is built from the same catalog.
		const loadContext = createLoadOptionsContext({ respond: (request) => send(request) });
		const chatModels = await new Empiriolabs().methods.loadOptions.getChatModels.call(loadContext);
		assert.ok(
			chatModels.some((option) => option.value === model),
			`${model} is in the chat model list`,
		);

		const context = createExecuteContext({
			parameters: {
				resource: 'chat',
				operation: 'create',
				model,
				inputType: 'prompt',
				prompt: 'Reply with the single word: pong',
				simplify: true,
				options: { maxTokens: 16, temperature: 0 },
			},
			respond: (request) => send(request),
		});
		const [output] = await new Empiriolabs().execute.call(context);
		const result = output[0].json;

		assert.equal(context.calls[0].url, '/chat/completions');
		assert.equal(typeof result.content, 'string');
		assert.ok(result.usage && typeof result.usage === 'object', 'the reply reports token usage');
		console.log(
			`chat completion: model=${result.model ?? model} finish_reason=${result.finish_reason} ` +
				`tokens=${result.usage.total_tokens ?? 'n/a'} reply=${JSON.stringify(String(result.content).slice(0, 40))}`,
		);
	});

	it('reads one page through the Document resource', async () => {
		const catalog = await send(
			{ baseURL: 'https://api.empiriolabs.ai/v1', url: '/models', method: 'GET', json: true },
			{ authenticate: false },
		);
		const loadContext = createLoadOptionsContext({ respond: (request) => send(request) });
		const documentModels =
			await new Empiriolabs().methods.loadOptions.getDocumentModels.call(loadContext);
		assert.ok(documentModels.length > 0, 'the catalog lists a document model');
		const model = process.env.EMPIRIOLABS_LIVE_OCR_MODEL || documentModels[0].value;
		assert.ok(catalog.data.some((entry) => entry.id === model), `${model} is in the catalog`);

		const fixture = path.join(
			path.dirname(fileURLToPath(import.meta.url)),
			'..',
			'fixtures',
			'invoice.png',
		);
		const context = createExecuteContext({
			parameters: {
				resource: 'document',
				operation: 'read',
				model,
				inputSource: 'binaryData',
				binaryPropertyName: 'data',
				waitForCompletion: true,
				options: { timeout: 300 },
			},
			binary: {
				data: {
					data: readFileSync(fixture).toString('base64'),
					mimeType: 'image/png',
					fileName: 'invoice.png',
					fileExtension: 'png',
				},
			},
			respond: (request) => send(request),
		});
		const [output] = await new Empiriolabs().execute.call(context);
		const result = output[0].json;

		assert.equal(context.calls[0].url, '/ocr');
		assert.match(result.text, /120[.,]00/);
		assert.match(result.text, /INVOICE\s*42/i);
		console.log(
			`document read: model=${model} pages=${result.pages.length} text=${JSON.stringify(result.text.slice(0, 60))}`,
		);
	});

	it('searches the web through the Web Search resource', async () => {
		const loadContext = createLoadOptionsContext({ respond: (request) => send(request) });
		const searchModels =
			await new Empiriolabs().methods.loadOptions.getSearchModels.call(loadContext);
		const ids = searchModels.map((option) => option.value);
		assert.ok(ids.length > 0, 'the catalog lists a search model');
		const model =
			process.env.EMPIRIOLABS_LIVE_SEARCH_MODEL || (ids.includes('tavily-search') ? 'tavily-search' : ids[0]);

		const context = createExecuteContext({
			parameters: {
				resource: 'webSearch',
				operation: 'search',
				model,
				query: 'n8n workflow automation',
				waitForCompletion: true,
				options: { timeout: 300 },
			},
			respond: (request) => send(request),
		});
		const [output] = await new Empiriolabs().execute.call(context);
		const result = output[0].json;

		assert.equal(context.calls[0].url, '/search');
		const text = JSON.stringify(result);
		assert.match(text, /https?:\/\//, 'the answer links to at least one page');
		console.log(`web search: model=${model} answer=${text.length} characters`);
	});
});

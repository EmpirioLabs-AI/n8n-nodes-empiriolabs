import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
	createExecuteContext,
	createLoadOptionsContext,
	loadDist,
	n8nWorkflow,
} from '../helpers/context.mjs';

const { Empiriolabs } = loadDist('nodes/Empiriolabs/Empiriolabs.node.js');
const { MCP_URL } = loadDist('nodes/Empiriolabs/transport.js');
const { buildToolArguments } = loadDist('nodes/Empiriolabs/actions/tool.js');
const { NodeApiError, NodeOperationError } = n8nWorkflow;

const node = new Empiriolabs();
const { getTools } = node.methods.loadOptions;
const { getToolFields } = node.methods.resourceMapping;

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
// A trimmed copy of the tool list of the workflows profile on 2026-10-25 (41 tools).
const LIVE_TOOLS = JSON.parse(readFileSync(path.join(fixtures, 'mcp-tools-list.json'), 'utf8'))
	.result.tools;

const EM_DASH = String.fromCharCode(0x2014);
const FIELD_TYPES = ['string', 'number', 'boolean', 'options', 'array', 'object'];

const OCR = {
	name: 'read_document',
	title: 'Read a document',
	annotations: { title: 'Read a document (OCR)', readOnlyHint: true },
	description: 'Read a PDF or an image with a document OCR model.',
	inputSchema: {
		type: 'object',
		required: ['model', 'document'],
		properties: {
			model: { type: 'string', description: 'Document OCR model id.' },
			document: {
				description: 'The PDF or image to read.',
				anyOf: [
					{ type: 'object', properties: { document_url: { type: 'string' } } },
					{ type: 'object', properties: { image_url: { type: 'string' } } },
				],
			},
			pages: { anyOf: [{ type: 'array', items: { type: 'integer' } }, { type: 'string' }] },
			images: { type: 'array', items: { type: 'string' } },
			include_blocks: { type: 'boolean', default: true },
			image_limit: { type: 'integer', minimum: 0 },
			table_format: { type: 'string', enum: ['markdown', 'html'] },
			dpi: { type: 'number' },
		},
	},
};

const MODELS = {
	name: 'list_models',
	annotations: { title: 'List models' },
	description: 'List EmpirioLabs models.',
	inputSchema: {
		type: 'object',
		properties: { query: { type: 'string' }, limit: { type: 'integer' } },
	},
};

function rpcResult(result) {
	return { jsonrpc: '2.0', id: 1, result };
}

/** Answers tools/list with `tools` and tools/call with `call(params)`, like the MCP server. */
function mcpServer({ tools = [OCR, MODELS], call } = {}) {
	return (request) => {
		const { method, params } = request.body;
		if (method === 'tools/list') {
			return rpcResult({ tools });
		}
		if (method === 'tools/call' && call) {
			return call(params);
		}
		throw new Error(`Unexpected JSON-RPC method ${method}`);
	};
}

function fieldsContext(tool, tools) {
	return createLoadOptionsContext({
		currentParameters: tool === undefined ? {} : { tool },
		respond: mcpServer({ tools }),
	});
}

async function run(parameters, respond, options = {}) {
	const context = createExecuteContext({ parameters, respond, ...options });
	const [output] = await node.execute.call(context);
	return { output, context };
}

function runParameters(overrides) {
	return { resource: 'tool', operation: 'run', inputMode: 'fields', ...overrides };
}

describe('Run a Tool requests', () => {
	it('lists tools with one authenticated JSON-RPC request to the workflows profile', async () => {
		const context = createLoadOptionsContext({ respond: mcpServer() });
		await getTools.call(context);

		assert.equal(MCP_URL, 'https://mcp.empiriolabs.ai/mcp/workflows');
		assert.deepEqual(context.calls, [
			{
				credentialName: 'empirioLabsApi',
				method: 'POST',
				url: 'https://mcp.empiriolabs.ai/mcp/workflows',
				body: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
				json: true,
				headers: { Accept: 'application/json, text/event-stream' },
				sendCredentialsOnCrossOriginRedirect: false,
			},
		]);
	});

	it('runs the tool with one tools/call request', async () => {
		const { context } = await run(
			runParameters({
				tool: 'list_models',
				toolArguments: { mappingMode: 'defineBelow', value: { query: 'qwen' } },
			}),
			mcpServer({ call: () => rpcResult({ content: [], structuredContent: {} }) }),
		);

		assert.deepEqual(context.calls, [
			{
				credentialName: 'empirioLabsApi',
				method: 'POST',
				url: 'https://mcp.empiriolabs.ai/mcp/workflows',
				body: {
					jsonrpc: '2.0',
					id: 1,
					method: 'tools/call',
					params: { name: 'list_models', arguments: { query: 'qwen' } },
				},
				json: true,
				headers: { Accept: 'application/json, text/event-stream' },
				sendCredentialsOnCrossOriginRedirect: false,
			},
		]);
	});
});

describe('Tool dropdown', () => {
	it('lists every tool by title, sorted, with its description', async () => {
		const options = await getTools.call(
			createLoadOptionsContext({
				respond: mcpServer({
					tools: [
						{
							name: 'zeta_tool',
							title: 'Not this title',
							annotations: { title: 'Zeta tool' },
							description: 'Last in the list.',
						},
						{ name: 'beta_tool', title: 'Beta tool' },
						{ name: 'alpha_tool', description: `Reads a file ${EM_DASH} quickly.` },
						{ name: '', title: 'No name' },
						{ title: 'Also no name' },
					],
				}),
			}),
		);

		assert.deepEqual(options, [
			{ name: 'alpha_tool', value: 'alpha_tool', description: 'Reads a file, quickly.' },
			{ name: 'Beta tool', value: 'beta_tool' },
			{ name: 'Zeta tool', value: 'zeta_tool', description: 'Last in the list.' },
		]);
	});

	it('lists all 41 tools of the live tool list', async () => {
		const options = await getTools.call(
			createLoadOptionsContext({ respond: mcpServer({ tools: LIVE_TOOLS }) }),
		);

		assert.equal(options.length, 41);
		assert.deepEqual(
			options.map((option) => option.value).sort(),
			LIVE_TOOLS.map((tool) => tool.name).sort(),
		);
		for (let index = 1; index < options.length; index++) {
			assert.ok(options[index - 1].name.localeCompare(options[index].name) <= 0, 'sorted by title');
		}
		const ocr = options.find((option) => option.value === 'read_document');
		assert.equal(ocr.name, 'Read a document (OCR)');
		assert.match(ocr.description, /^Read a PDF or an image/);
		assert.ok(!JSON.stringify(options).includes(EM_DASH));
	});
});

describe('Argument fields', () => {
	const base = { defaultMatch: false, canBeUsedToMatch: false, display: true };

	it('maps each kind of argument schema to a typed field', async () => {
		const shapes = {
			name: 'shapes',
			inputSchema: {
				type: 'object',
				required: ['prompt', 'document'],
				properties: {
					prompt: { type: 'string', description: 'What to make.' },
					image_url: { type: 'string' },
					limit: { type: 'integer' },
					temperature: { type: 'number' },
					include_blocks: { type: 'boolean', default: true },
					enable_thinking: { type: 'boolean' },
					format: { type: 'string', enum: ['markdown', 'html'] },
					images: { type: 'array', items: { type: 'string' } },
					parameters: { type: 'object', additionalProperties: true },
					seed: { type: ['integer', 'null'] },
					quality: { anyOf: [{ type: 'string', enum: ['low', 'high'] }, { type: 'null' }] },
					input: { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
					document: {
						anyOf: [
							{ type: 'object', properties: { document_url: { type: 'string' } } },
							{ type: 'object' },
						],
					},
					pages: {
						oneOf: [
							{ type: 'array', items: { type: 'integer' } },
							{ type: 'array', items: { type: 'string' } },
						],
					},
					scale: { anyOf: [{ type: 'integer' }, { type: 'number' }] },
					tool_choice: { anyOf: [{ type: 'string', enum: ['auto', 'none'] }, { type: 'object' }] },
					metadata: { properties: { tag: { type: 'string' } } },
					anything: {},
				},
			},
		};

		const { fields } = await getToolFields.call(fieldsContext('shapes', [shapes]));

		assert.deepEqual(fields, [
			{ ...base, id: 'prompt', displayName: 'Prompt', required: true, type: 'string' },
			{ ...base, id: 'image_url', displayName: 'Image URL', required: false, type: 'string' },
			{ ...base, id: 'limit', displayName: 'Limit', required: false, type: 'number' },
			{ ...base, id: 'temperature', displayName: 'Temperature', required: false, type: 'number' },
			{
				...base,
				id: 'include_blocks',
				displayName: 'Include Blocks',
				required: false,
				type: 'boolean',
				defaultValue: true,
			},
			{
				...base,
				id: 'enable_thinking',
				displayName: 'Enable Thinking',
				required: false,
				type: 'boolean',
				defaultValue: null,
			},
			{
				...base,
				id: 'format',
				displayName: 'Format',
				required: false,
				type: 'options',
				options: [
					{ name: 'markdown', value: 'markdown' },
					{ name: 'html', value: 'html' },
				],
			},
			{ ...base, id: 'images', displayName: 'Images', required: false, type: 'array' },
			{ ...base, id: 'parameters', displayName: 'Parameters', required: false, type: 'object' },
			{ ...base, id: 'seed', displayName: 'Seed', required: false, type: 'number' },
			{
				...base,
				id: 'quality',
				displayName: 'Quality',
				required: false,
				type: 'options',
				options: [
					{ name: 'low', value: 'low' },
					{ name: 'high', value: 'high' },
				],
			},
			{ ...base, id: 'input', displayName: 'Input', required: false, type: 'string' },
			{ ...base, id: 'document', displayName: 'Document', required: true, type: 'object' },
			{ ...base, id: 'pages', displayName: 'Pages', required: false, type: 'array' },
			{ ...base, id: 'scale', displayName: 'Scale', required: false, type: 'number' },
			{ ...base, id: 'tool_choice', displayName: 'Tool Choice', required: false, type: 'string' },
			{ ...base, id: 'metadata', displayName: 'Metadata', required: false, type: 'object' },
			{ ...base, id: 'anything', displayName: 'Anything', required: false, type: 'string' },
		]);
	});

	it('shows no fields until a tool is chosen from the list', async () => {
		for (const tool of [undefined, '', '={{ $json.tool }}']) {
			const context = fieldsContext(tool);
			assert.deepEqual(await getToolFields.call(context), { fields: [] });
			assert.equal(context.calls.length, 0);
		}
	});

	it('explains a tool without arguments and a tool that left the list', async () => {
		const noArguments = { name: 'list_batches', inputSchema: { type: 'object', properties: {} } };
		assert.deepEqual(await getToolFields.call(fieldsContext('list_batches', [noArguments])), {
			fields: [],
			emptyFieldsNotice: 'This tool takes no arguments.',
		});
		assert.deepEqual(await getToolFields.call(fieldsContext('retired_tool')), {
			fields: [],
			emptyFieldsNotice: 'This tool is not available any more. Choose another tool.',
		});
	});

	it('maps every tool of the live tool list to fields', async () => {
		let withoutArguments = 0;
		const typeOf = {};
		for (const tool of LIVE_TOOLS) {
			const result = await getToolFields.call(fieldsContext(tool.name, LIVE_TOOLS));
			const properties = tool.inputSchema.properties ?? {};
			const required = tool.inputSchema.required ?? [];

			assert.deepEqual(
				result.fields.map((field) => field.id),
				Object.keys(properties),
				tool.name,
			);
			if (result.fields.length === 0) {
				withoutArguments += 1;
				assert.equal(result.emptyFieldsNotice, 'This tool takes no arguments.');
			}
			for (const field of result.fields) {
				const where = `${tool.name}.${field.id}`;
				const schema = properties[field.id];
				assert.ok(FIELD_TYPES.includes(field.type), `${where} has type ${field.type}`);
				assert.ok(field.displayName.trim() !== '' && !field.displayName.includes(EM_DASH), where);
				assert.equal(field.required, required.includes(field.id), where);
				assert.equal(field.display, true, where);
				assert.equal(field.defaultMatch, false, where);
				assert.equal(field.canBeUsedToMatch, false, where);
				if (field.type === 'options') {
					assert.ok(field.options.length > 0, where);
					assert.ok(
						field.options.every((option) => option.name === option.value),
						where,
					);
				} else {
					assert.equal(field.options, undefined, where);
				}
				if (field.type === 'boolean') {
					assert.equal(field.defaultValue, schema.default ?? null, where);
				}
				typeOf[where] = field.type;
			}
		}

		assert.equal(withoutArguments, 3);
		assert.equal(typeOf['read_document.document'], 'object');
		assert.equal(typeOf['read_document.pages'], 'string');
		assert.equal(typeOf['read_document.table_format'], 'options');
		assert.equal(typeOf['embeddings.input'], 'string');
		assert.equal(typeOf['chat.messages'], 'array');
		assert.equal(typeOf['chat.tool_choice'], 'string');
		assert.equal(typeOf['chat.response_format'], 'object');
		assert.equal(typeOf['decide.state'], 'string');
		assert.equal(typeOf['generate_3d.image'], 'string');
		assert.equal(typeOf['generate_image.num_images'], 'number');
		assert.equal(typeOf['run_agent_task.attachments'], 'array');
		assert.equal(typeOf['web_research.messages'], 'array');
		assert.equal(typeOf['web_research.reasoning_effort'], 'options');
	});
});

describe('Tool arguments', () => {
	it('keep typed values, read JSON text for object and list fields, and skip empty fields', () => {
		const schema = [
			{ id: 'model', type: 'string' },
			{ id: 'document', type: 'object' },
			{ id: 'images', type: 'array' },
			{ id: 'pages', type: 'string' },
			{ id: 'include_blocks', type: 'boolean' },
			{ id: 'image_limit', type: 'number' },
			{ id: 'table_format', type: 'options' },
			{ id: 'parameters', type: 'object' },
			{ id: 'broken', type: 'object' },
		];
		assert.deepEqual(
			buildToolArguments(
				{
					model: 'ocr-model',
					document: '{"type": "document_url", "document_url": "https://example.com/a.pdf"}',
					images: '["https://example.com/1.png"]',
					pages: '[0, 2]',
					include_blocks: false,
					image_limit: 0,
					table_format: '',
					parameters: { seed: 7 },
					broken: '{not json',
					dpi: null,
					extract_header: undefined,
				},
				schema,
			),
			{
				model: 'ocr-model',
				document: { type: 'document_url', document_url: 'https://example.com/a.pdf' },
				images: ['https://example.com/1.png'],
				pages: '[0, 2]',
				include_blocks: false,
				image_limit: 0,
				parameters: { seed: 7 },
				broken: '{not json',
			},
		);
		assert.deepEqual(buildToolArguments(null, undefined), {});
		assert.deepEqual(buildToolArguments({ query: 'x' }, undefined), { query: 'x' });
	});
});

describe('Running a tool', () => {
	it('sends the fields as typed arguments and returns the text and structured result', async () => {
		const { fields } = await getToolFields.call(fieldsContext('read_document'));
		let sent;
		const { output } = await run(
			runParameters({
				tool: 'read_document',
				toolArguments: {
					mappingMode: 'defineBelow',
					value: {
						model: 'ocr-model',
						document: '{"type":"document_url","document_url":"https://example.com/a.pdf"}',
						pages: '0,2-4',
						images: '["https://example.com/1.png"]',
						include_blocks: false,
						image_limit: 0,
						table_format: '',
						dpi: null,
					},
					matchingColumns: [],
					schema: fields,
				},
			}),
			mcpServer({
				call: (params) => {
					sent = params;
					return rpcResult({
						content: [
							{ type: 'text', text: 'Page 1: Hello' },
							{ type: 'image', data: 'aGk=', mimeType: 'image/png' },
							{ type: 'text', text: 'Page 2: World' },
						],
						structuredContent: { pages: [{ index: 0, markdown: 'Hello' }], status: 'completed' },
						isError: false,
					});
				},
			}),
		);

		assert.deepEqual(sent, {
			name: 'read_document',
			arguments: {
				model: 'ocr-model',
				document: { type: 'document_url', document_url: 'https://example.com/a.pdf' },
				pages: '0,2-4',
				images: ['https://example.com/1.png'],
				include_blocks: false,
				image_limit: 0,
			},
		});
		assert.deepEqual(output, [
			{
				json: {
					tool: 'read_document',
					text: 'Page 1: Hello\n\nPage 2: World',
					result: { pages: [{ index: 0, markdown: 'Hello' }], status: 'completed' },
					job_id: null,
					status: 'completed',
				},
				pairedItem: { item: 0 },
			},
		]);
	});

	it('sends no arguments when no field is filled in', async () => {
		let sent;
		await run(
			runParameters({
				tool: ' list_models ',
				toolArguments: { mappingMode: 'defineBelow', value: null },
			}),
			mcpServer({
				call: (params) => {
					sent = params;
					return rpcResult({ content: [{ type: 'text', text: '3 models.' }] });
				},
			}),
		);
		assert.deepEqual(sent, { name: 'list_models', arguments: {} });
	});

	it('sends the JSON object in JSON mode', async () => {
		const sent = [];
		const respond = mcpServer({
			call: (params) => {
				sent.push(params.arguments);
				return rpcResult({ content: [{ type: 'text', text: 'ok' }] });
			},
		});
		await run(
			runParameters({
				tool: 'list_models',
				inputMode: 'json',
				jsonArguments: '{"query": "qwen", "limit": 3}',
			}),
			respond,
		);
		await run(
			runParameters({ tool: 'list_models', inputMode: 'json', jsonArguments: { query: 'x' } }),
			respond,
		);
		assert.deepEqual(sent, [{ query: 'qwen', limit: 3 }, { query: 'x' }]);

		await assert.rejects(
			run(
				runParameters({ tool: 'list_models', inputMode: 'json', jsonArguments: '[1, 2]' }),
				respond,
			),
			(error) =>
				error instanceof NodeOperationError &&
				/Arguments \(JSON\) must be a JSON object/.test(error.message),
		);
		assert.equal(sent.length, 2);
	});

	it('returns the job ID and status of a long job, for the Job resource', async () => {
		const { output } = await run(
			runParameters({
				tool: 'read_document',
				toolArguments: { mappingMode: 'defineBelow', value: { model: 'm', document: {} } },
			}),
			mcpServer({
				call: () =>
					rpcResult({
						content: [{ type: 'text', text: 'The job is still running.' }],
						structuredContent: { job_id: 'job_123', status: 'processing' },
					}),
			}),
		);
		assert.deepEqual(output[0].json, {
			tool: 'read_document',
			text: 'The job is still running.',
			result: { job_id: 'job_123', status: 'processing' },
			job_id: 'job_123',
			status: 'processing',
		});
	});

	it("stops with the tool's own error text", async () => {
		const failWith = (content) =>
			run(
				runParameters({ tool: 'list_models', toolArguments: { value: { query: 'x' } } }),
				mcpServer({ call: () => rpcResult({ content, isError: true }) }),
			);

		await assert.rejects(failWith([{ type: 'text', text: 'Unknown model: nope.' }]), (error) => {
			assert.ok(error instanceof NodeOperationError);
			assert.equal(error.message, 'Unknown model: nope.');
			assert.equal(error.context.itemIndex, 0);
			return true;
		});
		await assert.rejects(
			failWith([]),
			(error) =>
				error instanceof NodeOperationError &&
				error.message === 'EmpirioLabs AI could not run this tool.',
		);
	});

	it('stops with the message of a JSON-RPC error, for the right item', async () => {
		await assert.rejects(
			run(
				[
					runParameters({ tool: 'list_models', toolArguments: { value: { query: 'a' } } }),
					runParameters({ tool: 'list_models', toolArguments: { value: { query: 'b' } } }),
				],
				mcpServer({
					call: (params) =>
						params.arguments.query === 'a'
							? rpcResult({ content: [{ type: 'text', text: 'ok' }] })
							: { jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'Invalid arguments.' } },
				}),
				{ items: [{ json: {} }, { json: {} }] },
			),
			(error) => {
				assert.ok(error instanceof NodeOperationError);
				assert.equal(error.message, 'Invalid arguments.');
				assert.equal(error.context.itemIndex, 1);
				return true;
			},
		);
	});

	it('reports a failed request as an API error with the item index', async () => {
		await assert.rejects(
			run(runParameters({ tool: 'list_models', toolArguments: { value: {} } }), () => {
				throw Object.assign(new Error('Request failed with status code 401'), {
					httpCode: '401',
				});
			}),
			(error) => {
				assert.ok(error instanceof NodeApiError);
				assert.equal(String(error.httpCode), '401');
				assert.equal(error.context.itemIndex, 0);
				return true;
			},
		);
	});

	it('rejects an answer that is not a JSON-RPC response', async () => {
		await assert.rejects(
			run(
				runParameters({ tool: 'list_models', toolArguments: { value: {} } }),
				() => '<html>Bad gateway</html>',
			),
			(error) => error instanceof NodeOperationError && /could not be read/.test(error.message),
		);
	});

	it('asks for a tool when none is set', async () => {
		const context = createExecuteContext({
			parameters: runParameters({ tool: '', toolArguments: { value: {} } }),
			respond: mcpServer(),
		});
		await assert.rejects(
			node.execute.call(context),
			(error) => error instanceof NodeOperationError && /Choose a tool to run/.test(error.message),
		);
		assert.equal(context.calls.length, 0);
	});

	it('returns an error item for a failed run when Continue On Fail is on', async () => {
		const { output } = await run(
			[
				runParameters({ tool: 'list_models', toolArguments: { value: { query: 'nope' } } }),
				runParameters({ tool: 'list_models', toolArguments: { value: { query: 'qwen' } } }),
			],
			mcpServer({
				call: (params) =>
					params.arguments.query === 'nope'
						? rpcResult({
								content: [{ type: 'text', text: 'Unknown model: nope.' }],
								isError: true,
							})
						: rpcResult({ content: [{ type: 'text', text: '1 model.' }] }),
			}),
			{ items: [{ json: {} }, { json: {} }], continueOnFail: true },
		);
		assert.deepEqual(output, [
			{ json: { error: 'Unknown model: nope.' }, pairedItem: { item: 0 } },
			{
				json: { tool: 'list_models', text: '1 model.', result: {}, job_id: null, status: null },
				pairedItem: { item: 1 },
			},
		]);
	});
});

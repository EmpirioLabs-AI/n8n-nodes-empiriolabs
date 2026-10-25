import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
	CATALOG_FIXTURE,
	createExecuteContext,
	loadDist,
	n8nWorkflow,
} from '../helpers/context.mjs';

const { Empiriolabs } = loadDist('nodes/Empiriolabs/Empiriolabs.node.js');
const { NodeApiError, NodeOperationError } = n8nWorkflow;

const node = new Empiriolabs();

async function run(options) {
	const context = createExecuteContext(options);
	const [output] = await node.execute.call(context);
	return { output, context };
}

describe('node description', () => {
	it('is a usable-as-tool node with every resource', () => {
		const { description } = node;
		assert.equal(description.name, 'empiriolabs');
		assert.equal(description.displayName, 'EmpirioLabs AI');
		assert.equal(description.usableAsTool, true);
		assert.deepEqual(description.credentials, [{ name: 'empirioLabsApi', required: true }]);
		const resource = description.properties.find((property) => property.name === 'resource');
		assert.deepEqual(
			resource.options.map((option) => option.value),
			['audio', 'chat', 'embedding', 'image', 'job', 'model', 'tool', 'video'],
		);
	});

	it('loads the tool list and the arguments of each tool from the API', () => {
		const find = (name) => node.description.properties.find((property) => property.name === name);
		const tool = find('tool');
		assert.equal(tool.type, 'options');
		assert.equal(tool.options, undefined);
		assert.ok(tool.typeOptions.loadOptionsMethod in node.methods.loadOptions);

		const toolArguments = find('toolArguments');
		assert.equal(toolArguments.type, 'resourceMapper');
		assert.deepEqual(toolArguments.default, { mappingMode: 'defineBelow', value: null });
		assert.deepEqual(toolArguments.typeOptions.loadOptionsDependsOn, ['tool']);
		assert.ok(
			toolArguments.typeOptions.resourceMapper.resourceMapperMethod in node.methods.resourceMapping,
		);
		assert.deepEqual(
			find('inputMode').options.map((option) => option.value),
			['fields', 'json'],
		);
		assert.equal(find('jsonArguments').type, 'json');
	});

	it('loads every model list from the API instead of a fixed list', () => {
		const modelFields = node.description.properties.filter((property) => property.name === 'model');
		assert.equal(modelFields.length, 6);
		for (const field of modelFields) {
			assert.equal(field.type, 'options');
			assert.ok(field.typeOptions.loadOptionsMethod in node.methods.loadOptions);
			assert.equal(field.options, undefined);
		}
	});

	it('keeps user-facing text free of em dashes', () => {
		assert.ok(!JSON.stringify(node.description).includes(String.fromCharCode(0x2014)));
	});
});

describe('chat', () => {
	it('sends a prompt with options and returns the simplified reply', async () => {
		const { output, context } = await run({
			parameters: {
				resource: 'chat',
				operation: 'create',
				model: 'zeta-chat',
				inputType: 'prompt',
				prompt: 'Say hello',
				simplify: true,
				options: {
					systemMessage: 'Be brief',
					temperature: 0.2,
					maxTokens: 50,
					responseFormat: 'json_object',
					modelParameters: '{"seed": 7, "model": "ignored"}',
				},
			},
			respond: () => ({
				id: 'chatcmpl-1',
				model: 'zeta-chat',
				choices: [
					{
						message: { role: 'assistant', content: 'Hello', reasoning_content: 'hm' },
						finish_reason: 'stop',
					},
				],
				usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
			}),
		});

		const [call] = context.calls;
		assert.equal(call.method, 'POST');
		assert.equal(call.url, '/chat/completions');
		assert.deepEqual(call.body, {
			temperature: 0.2,
			max_tokens: 50,
			response_format: { type: 'json_object' },
			seed: 7,
			model: 'zeta-chat',
			messages: [
				{ role: 'system', content: 'Be brief' },
				{ role: 'user', content: 'Say hello' },
			],
			stream: false,
		});
		assert.deepEqual(output, [
			{
				json: {
					content: 'Hello',
					reasoning: 'hm',
					finish_reason: 'stop',
					model: 'zeta-chat',
					usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
					id: 'chatcmpl-1',
				},
				pairedItem: { item: 0 },
			},
		]);
	});

	it('sends a conversation and can return the raw response', async () => {
		const raw = { id: 'x', choices: [{ message: { content: 'ok' } }] };
		const { output, context } = await run({
			parameters: {
				resource: 'chat',
				operation: 'create',
				model: 'zeta-chat',
				inputType: 'messages',
				messages: {
					values: [
						{ role: 'system', content: 'Rules' },
						{ role: 'user', content: 'Hi' },
						{ role: 'assistant', content: '' },
					],
				},
				simplify: false,
				options: {},
			},
			respond: () => raw,
		});
		assert.deepEqual(context.calls[0].body.messages, [
			{ role: 'system', content: 'Rules' },
			{ role: 'user', content: 'Hi' },
		]);
		assert.deepEqual(output[0].json, raw);
	});

	it('asks for at least one message', async () => {
		await assert.rejects(
			run({
				parameters: {
					resource: 'chat',
					operation: 'create',
					model: 'zeta-chat',
					inputType: 'messages',
					messages: {},
					options: {},
				},
				respond: () => ({}),
			}),
			(error) => error instanceof NodeOperationError && /at least one message/.test(error.message),
		);
	});
});

describe('image', () => {
	it('returns each generated image as binary data', async () => {
		const { output, context } = await run({
			parameters: {
				resource: 'image',
				operation: 'generate',
				model: 'pixel-image',
				prompt: 'A red cube',
				options: {
					aspectRatio: '1:1',
					numberOfImages: 2,
					referenceImageUrls: 'https://a.example/x.png, ',
				},
			},
			respond: () => ({
				created: 1,
				data: [
					{ url: 'https://media.example/out/1.png?sig=abc' },
					{ b64_json: Buffer.from('second').toString('base64') },
				],
			}),
			download: () => ({ body: Buffer.from('first'), headers: { 'content-type': 'image/png' } }),
		});

		assert.deepEqual(context.calls[0].body, {
			aspect_ratio: '1:1',
			num_images: 2,
			image: ['https://a.example/x.png'],
			model: 'pixel-image',
			prompt: 'A red cube',
			sync: true,
		});
		// Media downloads never carry the API credential.
		assert.equal(context.downloads.length, 1);
		assert.equal(context.downloads[0].url, 'https://media.example/out/1.png?sig=abc');
		assert.equal(context.downloads[0].headers, undefined);

		assert.equal(output.length, 2);
		assert.equal(Buffer.from(output[0].binary.data.data, 'base64').toString(), 'first');
		assert.equal(output[0].binary.data.fileName, 'image-1.png');
		assert.equal(output[0].json.url, 'https://media.example/out/1.png?sig=abc');
		assert.equal(Buffer.from(output[1].binary.data.data, 'base64').toString(), 'second');
		assert.equal(output[1].binary.data.mimeType, 'image/png');
		assert.deepEqual(output[1].pairedItem, { item: 0 });
	});

	it('waits for the job when the API answers with a job', async () => {
		const { output, context } = await run({
			parameters: {
				resource: 'image',
				operation: 'generate',
				model: 'pixel-image',
				prompt: 'A slow render',
				options: { binaryPropertyOutput: 'picture' },
			},
			respond: (request) =>
				request.method === 'POST'
					? { job_id: 'job_img', status: 'processing', poll_url: '/v1/jobs/job_img' }
					: {
							job_id: 'job_img',
							status: 'completed',
							result: { data: [{ b64_json: Buffer.from('img').toString('base64') }] },
						},
		});
		assert.equal(context.calls[1].url, '/jobs/job_img');
		assert.equal(Buffer.from(output[0].binary.picture.data, 'base64').toString(), 'img');
	});
});

describe('audio', () => {
	it('returns audio bytes from text to speech as binary data', async () => {
		const { output, context } = await run({
			parameters: {
				resource: 'audio',
				operation: 'textToSpeech',
				model: 'omni-speech',
				text: 'Hello there',
				voice: 'Kore',
				options: { outputFormat: 'mp3' },
			},
			respond: () => ({
				statusCode: 200,
				headers: { 'content-type': 'audio/mpeg' },
				body: Buffer.from('ID3audio'),
			}),
		});
		const [call] = context.calls;
		assert.equal(call.url, '/audio/speech');
		assert.equal(call.encoding, 'arraybuffer');
		assert.deepEqual(call.body, {
			voice: 'Kore',
			output_format: 'mp3',
			model: 'omni-speech',
			input: 'Hello there',
		});
		assert.equal(Buffer.from(output[0].binary.data.data, 'base64').toString(), 'ID3audio');
		assert.equal(output[0].binary.data.mimeType, 'audio/mpeg');
		assert.equal(output[0].binary.data.fileName, 'speech.mp3');
	});

	it('downloads the audio file when text to speech answers with JSON', async () => {
		const { output } = await run({
			parameters: {
				resource: 'audio',
				operation: 'textToSpeech',
				model: 'omni-speech',
				text: 'Hi',
				voice: '',
				options: {},
			},
			respond: () => ({
				statusCode: 200,
				headers: { 'content-type': 'application/json' },
				body: Buffer.from(
					JSON.stringify({
						model: 'omni-speech',
						data: [
							{ url: 'https://media.example/a/speech.wav', format: 'wav', duration_seconds: 1.5 },
						],
					}),
				),
			}),
			download: () => ({
				body: Buffer.from('RIFF'),
				headers: { 'content-type': 'application/octet-stream' },
			}),
		});
		assert.equal(output[0].json.duration, 1.5);
		assert.equal(output[0].json.format, 'wav');
		assert.equal(output[0].binary.data.mimeType, 'audio/wav');
		assert.equal(output[0].binary.data.fileName, 'speech.wav');
	});

	it('shows the API message when text to speech is refused', async () => {
		await assert.rejects(
			run({
				parameters: {
					resource: 'audio',
					operation: 'textToSpeech',
					model: 'omni-speech',
					text: 'Hi',
					voice: '',
					options: {},
				},
				respond: () => ({
					statusCode: 400,
					headers: { 'content-type': 'application/json' },
					body: Buffer.from(
						JSON.stringify({
							error: { message: 'Voice is not supported', type: 'invalid_request_error' },
						}),
					),
				}),
			}),
			(error) => {
				assert.ok(error instanceof NodeApiError);
				assert.equal(String(error.httpCode), '400');
				assert.match(error.description, /Voice is not supported/);
				return true;
			},
		);
	});

	it('uploads a binary file for transcription and waits for the transcript', async () => {
		const { output, context } = await run({
			parameters: {
				resource: 'audio',
				operation: 'transcribe',
				model: 'batch-asr',
				inputSource: 'binaryData',
				binaryPropertyName: 'data',
				waitForTranscript: true,
				simplify: true,
				options: { language: 'en', modelParameters: '{"diarize": true}' },
			},
			binary: {
				data: {
					data: Buffer.from('AUDIO').toString('base64'),
					mimeType: 'audio/mpeg',
					fileName: 'call.mp3',
					fileExtension: 'mp3',
				},
			},
			respond: (request) =>
				request.method === 'POST'
					? { job_id: 'job_stt', status: 'processing' }
					: {
							job_id: 'job_stt',
							status: 'completed',
							result: { text: 'hello world', language: 'en', duration: 2 },
						},
		});

		const [upload, poll] = context.calls;
		assert.equal(upload.url, '/audio/transcriptions');
		assert.match(upload.headers['Content-Type'], /^multipart\/form-data; boundary=/);
		const form = upload.body.toString('utf8');
		assert.match(form, /name="language"\r\n\r\nen\r\n/);
		assert.match(form, /name="diarize"\r\n\r\ntrue\r\n/);
		assert.match(form, /name="model"\r\n\r\nbatch-asr\r\n/);
		assert.match(
			form,
			/name="file"; filename="call.mp3"\r\nContent-Type: audio\/mpeg\r\n\r\nAUDIO\r\n/,
		);
		assert.equal(poll.url, '/jobs/job_stt');
		assert.deepEqual(output[0].json, {
			text: 'hello world',
			language: 'en',
			duration: 2,
			job_id: 'job_stt',
		});
	});

	it('transcribes a file URL and can return the job without waiting', async () => {
		const { output, context } = await run({
			parameters: {
				resource: 'audio',
				operation: 'transcribe',
				model: 'batch-asr',
				inputSource: 'url',
				fileUrl: ' https://files.example/a.wav ',
				waitForTranscript: false,
				options: {},
			},
			respond: () => ({ job_id: 'job_url', status: 'processing', poll_url: '/v1/jobs/job_url' }),
		});
		assert.deepEqual(context.calls[0].body, {
			model: 'batch-asr',
			file_url: 'https://files.example/a.wav',
		});
		assert.equal(context.calls.length, 1);
		assert.equal(output[0].json.job_id, 'job_url');
	});
});

describe('video', () => {
	it('returns the job right away by default', async () => {
		const { output, context } = await run({
			parameters: {
				resource: 'video',
				operation: 'generate',
				model: 'reel-video',
				prompt: 'Waves',
				waitForCompletion: false,
				options: { duration: 5, generateAudio: false, imageUrl: 'https://a.example/f.jpg' },
			},
			respond: () => ({ job_id: 'job_vid', status: 'processing', poll_url: '/v1/jobs/job_vid' }),
		});
		assert.deepEqual(context.calls[0].body, {
			duration: 5,
			generate_audio: false,
			image: 'https://a.example/f.jpg',
			model: 'reel-video',
			prompt: 'Waves',
		});
		assert.equal(output[0].json.job_id, 'job_vid');
	});

	it('waits for the video and downloads it', async () => {
		const { output } = await run({
			parameters: {
				resource: 'video',
				operation: 'generate',
				model: 'reel-video',
				prompt: 'Waves',
				waitForCompletion: true,
				timeout: 60,
				downloadVideo: true,
				options: {},
			},
			respond: (request) =>
				request.method === 'POST'
					? { job_id: 'job_vid', status: 'processing' }
					: {
							job_id: 'job_vid',
							status: 'completed',
							result: { data: [{ url: 'https://media.example/v/clip.mp4' }] },
						},
			download: () => ({ body: Buffer.from('MP4'), headers: { 'content-type': 'video/mp4' } }),
		});
		assert.equal(output[0].json.status, 'completed');
		assert.equal(output[0].binary.data.fileName, 'video.mp4');
		assert.equal(output[0].binary.data.mimeType, 'video/mp4');
	});
});

describe('embedding', () => {
	it('returns the vector', async () => {
		const { output, context } = await run({
			parameters: {
				resource: 'embedding',
				operation: 'create',
				model: 'legacy-embed',
				text: 'hi',
				simplify: true,
				options: {},
			},
			respond: () => ({
				model: 'legacy-embed',
				data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }],
				usage: { total_tokens: 1 },
			}),
		});
		assert.deepEqual(context.calls[0].body, { model: 'legacy-embed', input: 'hi' });
		assert.deepEqual(output[0].json, {
			embedding: [0.1, 0.2, 0.3],
			dimensions: 3,
			model: 'legacy-embed',
			usage: { total_tokens: 1 },
		});
	});
});

describe('job and model', () => {
	it('gets a job and downloads its file', async () => {
		const { output, context } = await run({
			parameters: {
				resource: 'job',
				operation: 'get',
				jobId: { __rl: true, mode: 'id', value: ' job_9 ' },
				downloadOutput: true,
				binaryPropertyOutput: 'file',
			},
			respond: () => ({
				job_id: 'job_9',
				status: 'completed',
				result: { data: [{ url: 'https://media.example/x/out.mp4' }] },
			}),
			download: () => ({ body: Buffer.from('v'), headers: { 'content-type': 'video/mp4' } }),
		});
		assert.equal(context.calls[0].url, '/jobs/job_9');
		assert.equal(output[0].binary.file.fileName, 'out.mp4');
	});

	it('explains that a running job has no file yet', async () => {
		await assert.rejects(
			run({
				parameters: { resource: 'job', operation: 'get', jobId: 'job_9', downloadOutput: true },
				respond: () => ({ job_id: 'job_9', status: 'processing' }),
			}),
			/no file to download yet/,
		);
	});

	it('gets many jobs with a status filter and limit', async () => {
		const { output, context } = await run({
			parameters: {
				resource: 'job',
				operation: 'getAll',
				returnAll: false,
				limit: 2,
				filters: { status: 'completed' },
			},
			respond: () => ({ data: [{ job_id: 'a' }, { job_id: 'b' }, { job_id: 'c' }] }),
		});
		assert.deepEqual(context.calls[0].qs, { limit: 2, status: 'completed' });
		assert.deepEqual(
			output.map((item) => item.json.job_id),
			['a', 'b'],
		);
	});

	it('gets many models with filters and simplified fields', async () => {
		const { output } = await run({
			parameters: {
				resource: 'model',
				operation: 'getAll',
				returnAll: true,
				filters: { category: 'text', search: 'ALPHA' },
				simplify: true,
			},
			respond: () => CATALOG_FIXTURE,
		});
		assert.deepEqual(
			output.map((item) => item.json.id),
			['alpha-chat'],
		);
		assert.equal(output[0].json.deprecated, undefined);
		assert.equal(output[0].json.display_name, 'Alpha Chat');
	});
});

describe('errors', () => {
	it('continues with an error item when Continue On Fail is on', async () => {
		const { output } = await run({
			parameters: [
				{ resource: 'model', operation: 'getAll', returnAll: true, filters: {}, simplify: true },
				{ resource: 'job', operation: 'get', jobId: 'job_x', downloadOutput: false },
			],
			items: [{ json: {} }, { json: {} }],
			continueOnFail: true,
			respond: (request) => {
				if (request.url === '/models') {
					throw Object.assign(new Error('Request failed with status code 401'), {
						httpCode: '401',
					});
				}
				return { job_id: 'job_x', status: 'processing' };
			},
		});
		assert.equal(output[0].pairedItem.item, 0);
		assert.ok(typeof output[0].json.error === 'string');
		assert.equal(output.at(-1).json.job_id, 'job_x');
	});

	it('throws a NodeApiError with the item index otherwise', async () => {
		await assert.rejects(
			run({
				parameters: { resource: 'job', operation: 'get', jobId: 'missing', downloadOutput: false },
				respond: () => {
					throw Object.assign(new Error('Request failed with status code 404'), {
						httpCode: '404',
					});
				},
			}),
			(error) => error instanceof NodeApiError && error.context.itemIndex === 0,
		);
	});
});

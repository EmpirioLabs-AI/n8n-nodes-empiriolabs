import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
	createExecuteContext,
	createLoadOptionsContext,
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

function apiError(status) {
	return Object.assign(new Error(`Request failed with status code ${status}`), {
		httpCode: String(status),
	});
}

describe('audio generate music or sound', () => {
	it('starts the job with the prompt and options and returns it right away by default', async () => {
		const envelope = { job_id: 'job_music', status: 'processing', poll_url: '/v1/jobs/job_music' };
		const { output, context } = await run({
			parameters: {
				resource: 'audio',
				operation: 'generate',
				model: 'tune-maker',
				prompt: 'Lo-fi hip hop, mellow piano',
				waitForCompletion: false,
				options: {
					lyrics: 'We ran the city lights',
					duration: 60,
					steps: 8,
					cfgScale: 1.5,
					seed: 0,
					outputFormat: 'wav',
					modelParameters: '{"instrumental": false, "model": "ignored"}',
				},
			},
			respond: () => envelope,
		});

		assert.equal(context.calls.length, 1);
		const [request] = context.calls;
		assert.equal(request.method, 'POST');
		assert.equal(request.url, '/audio/generations');
		assert.deepEqual(request.body, {
			prompt: 'Lo-fi hip hop, mellow piano',
			lyrics: 'We ran the city lights',
			duration: 60,
			steps: 8,
			cfg_scale: 1.5,
			seed: 0,
			output_format: 'wav',
			instrumental: false,
			model: 'tune-maker',
		});
		assert.deepEqual(output, [{ json: envelope, pairedItem: { item: 0 } }]);
	});

	it('leaves out an empty prompt, for models that take other inputs', async () => {
		const { context } = await run({
			parameters: {
				resource: 'audio',
				operation: 'generate',
				model: 'mix-maker',
				prompt: '  ',
				waitForCompletion: false,
				options: { modelParameters: { voice_url: 'https://files.example/voice.mp3' } },
			},
			respond: () => ({ job_id: 'job_mix', status: 'processing' }),
		});
		assert.deepEqual(context.calls[0].body, {
			voice_url: 'https://files.example/voice.mp3',
			model: 'mix-maker',
		});
	});

	it('waits for the job and downloads the audio as a binary file', async () => {
		const job = {
			job_id: 'job_music',
			status: 'completed',
			endpoint: '/v1/audio/generations',
			model: 'tune-maker',
			result: { data: [{ url: 'https://media.example/a/track.wav?sig=1', format: 'wav' }] },
		};
		const { output, context } = await run({
			parameters: {
				resource: 'audio',
				operation: 'generate',
				model: 'tune-maker',
				prompt: 'A short jingle',
				waitForCompletion: true,
				timeout: 60,
				downloadAudio: true,
				options: { binaryPropertyOutput: 'track' },
			},
			respond: (request) =>
				request.method === 'POST' ? { job_id: 'job_music', status: 'processing' } : job,
			download: () => ({
				body: Buffer.from('RIFF'),
				headers: { 'content-type': 'application/octet-stream' },
			}),
		});

		const [start, poll] = context.calls;
		assert.equal(start.url, '/audio/generations');
		assert.equal(poll.method, 'GET');
		assert.equal(poll.url, '/jobs/job_music');
		// The signed file URL is downloaded without the API credential.
		assert.equal(context.downloads.length, 1);
		assert.equal(context.downloads[0].url, 'https://media.example/a/track.wav?sig=1');
		assert.equal(context.downloads[0].headers, undefined);

		assert.equal(output.length, 1);
		assert.deepEqual(output[0].json, job);
		assert.deepEqual(output[0].pairedItem, { item: 0 });
		assert.equal(Buffer.from(output[0].binary.track.data, 'base64').toString(), 'RIFF');
		assert.equal(output[0].binary.track.fileName, 'audio.wav');
		assert.equal(output[0].binary.track.mimeType, 'audio/wav');
	});

	it('returns every file of the result as its own item', async () => {
		const { output } = await run({
			parameters: {
				resource: 'audio',
				operation: 'generate',
				model: 'tune-maker',
				prompt: 'Two takes',
				waitForCompletion: true,
				timeout: 60,
				downloadAudio: true,
				options: {},
			},
			respond: (request) =>
				request.method === 'POST'
					? { job_id: 'job_two', status: 'processing' }
					: {
							job_id: 'job_two',
							status: 'completed',
							result: {
								data: [
									{ url: 'https://media.example/a/take-a.mp3' },
									{ b64_json: Buffer.from('second').toString('base64') },
								],
							},
						},
			download: () => ({ body: Buffer.from('first'), headers: { 'content-type': 'audio/mpeg' } }),
		});
		assert.deepEqual(
			output.map((item) => [item.binary.data.fileName, item.binary.data.mimeType]),
			[
				['audio-1.mp3', 'audio/mpeg'],
				['audio-2.mp3', 'audio/mpeg'],
			],
		);
		assert.equal(output[1].json.job_id, 'job_two');
	});

	it('returns the finished job without a download when Download Audio is off', async () => {
		const { output, context } = await run({
			parameters: {
				resource: 'audio',
				operation: 'generate',
				model: 'tune-maker',
				prompt: 'A short jingle',
				waitForCompletion: true,
				timeout: 60,
				downloadAudio: false,
				options: {},
			},
			respond: (request) =>
				request.method === 'POST'
					? { job_id: 'job_music', status: 'processing' }
					: {
							job_id: 'job_music',
							status: 'completed',
							result: { data: [{ url: 'https://media.example/a/track.mp3' }] },
						},
		});
		assert.equal(context.downloads.length, 0);
		assert.equal(output[0].binary, undefined);
		assert.equal(output[0].json.status, 'completed');
	});

	it('reports a failed job with the API message', async () => {
		await assert.rejects(
			run({
				parameters: {
					resource: 'audio',
					operation: 'generate',
					model: 'tune-maker',
					prompt: 'A short jingle',
					waitForCompletion: true,
					timeout: 60,
					downloadAudio: true,
					options: {},
				},
				respond: (request) =>
					request.method === 'POST'
						? { job_id: 'job_bad', status: 'processing' }
						: { job_id: 'job_bad', status: 'failed', error: { message: 'Lyrics are too long' } },
			}),
			(error) => {
				assert.ok(error instanceof NodeOperationError);
				assert.match(error.message, /job_bad ended with status "failed"/);
				assert.equal(error.description, 'Lyrics are too long');
				return true;
			},
		);
	});

	it('explains a finished job without a file', async () => {
		await assert.rejects(
			run({
				parameters: {
					resource: 'audio',
					operation: 'generate',
					model: 'tune-maker',
					prompt: 'A short jingle',
					waitForCompletion: true,
					timeout: 60,
					downloadAudio: true,
					options: {},
				},
				respond: (request) =>
					request.method === 'POST'
						? { job_id: 'job_empty', status: 'processing' }
						: { job_id: 'job_empty', status: 'completed', result: { data: [] } },
			}),
			(error) => {
				assert.ok(error instanceof NodeOperationError);
				assert.match(error.message, /did not include a file/);
				assert.match(error.description, /Download Audio/);
				return true;
			},
		);
	});
});

describe('voice', () => {
	const voices = [
		{ id: 'olivia', name: 'Olivia Lin', gender: 'Female', kind: 'system' },
		{ id: 'el_voice_1', name: 'My Voice', kind: 'custom', status: 'ready' },
		{ id: 'el_voice_2', name: 'el_voice_2', kind: 'custom', status: 'processing' },
	];

	it('gets many voices with the model and filters as the query and one item per voice', async () => {
		const { output, context } = await run({
			parameters: {
				resource: 'voice',
				operation: 'getAll',
				model: 'speech-model',
				returnAll: false,
				limit: 2,
				filters: {
					type: 'custom',
					language: ' en ',
					gender: 'female',
					tier: 'flash',
					pitch: 'low',
					search: ' warm ',
					multilingual: false,
				},
			},
			respond: () => ({ object: 'list', model: 'speech-model', total: 3, data: voices }),
		});

		assert.equal(context.calls.length, 1);
		const [request] = context.calls;
		assert.equal(request.method, 'GET');
		assert.equal(request.url, '/voices');
		assert.equal(request.body, undefined);
		assert.deepEqual(request.qs, {
			model: 'speech-model',
			type: 'custom',
			language: 'en',
			gender: 'female',
			tier: 'flash',
			pitch: 'low',
			q: 'warm',
			multilingual: false,
		});
		assert.deepEqual(output, [
			{ json: voices[0], pairedItem: { item: 0 } },
			{ json: voices[1], pairedItem: { item: 0 } },
		]);
	});

	it('sends only the model without filters and can return all voices', async () => {
		const { output, context } = await run({
			parameters: {
				resource: 'voice',
				operation: 'getAll',
				model: 'speech-model',
				returnAll: true,
				filters: {},
			},
			respond: () => ({ object: 'list', model: 'speech-model', total: 3, data: voices }),
		});
		assert.deepEqual(context.calls[0].qs, { model: 'speech-model' });
		assert.equal(output.length, 3);
	});

	it('deletes a voice by its ID on the model it was created on', async () => {
		const deleted = { id: 'el_voice/1', object: 'voice.deleted', deleted: true };
		const { output, context } = await run({
			parameters: {
				resource: 'voice',
				operation: 'delete',
				model: 'speech-model',
				voiceId: { __rl: true, mode: 'id', value: ' el_voice/1 ' },
			},
			respond: () => deleted,
		});
		assert.equal(context.calls.length, 1);
		const [request] = context.calls;
		assert.equal(request.method, 'DELETE');
		assert.equal(request.url, '/voices/el_voice%2F1');
		assert.equal(request.body, undefined);
		assert.deepEqual(request.qs, { model: 'speech-model' });
		assert.deepEqual(output, [{ json: deleted, pairedItem: { item: 0 } }]);
	});

	it('asks for a voice when none is selected', async () => {
		await assert.rejects(
			run({
				parameters: {
					resource: 'voice',
					operation: 'delete',
					model: 'speech-model',
					voiceId: { __rl: true, mode: 'list', value: '' },
				},
				respond: () => {
					throw new Error('no request expected');
				},
			}),
			(error) => error instanceof NodeOperationError && /Select a voice/.test(error.message),
		);
	});

	it('shows the API message when a voice cannot be deleted', async () => {
		await assert.rejects(
			run({
				parameters: {
					resource: 'voice',
					operation: 'delete',
					model: 'speech-model',
					voiceId: 'el_voice_gone',
				},
				respond: () => {
					throw apiError(404);
				},
			}),
			(error) => error instanceof NodeApiError && String(error.httpCode) === '404',
		);
	});

	it('lists the custom voices of the selected model for the Voice picker', async () => {
		const context = createLoadOptionsContext({
			currentParameters: { model: 'speech-model' },
			respond: () => ({ object: 'list', model: 'speech-model', total: 3, data: voices }),
		});
		const all = await node.methods.listSearch.searchCustomVoices.call(context);
		assert.equal(context.calls[0].method, 'GET');
		assert.equal(context.calls[0].url, '/voices');
		assert.deepEqual(context.calls[0].qs, { model: 'speech-model', type: 'custom' });
		// A preset voice is never offered for deletion.
		assert.deepEqual(all.results, [
			{ name: 'My Voice, ready (el_voice_1)', value: 'el_voice_1' },
			{ name: 'processing (el_voice_2)', value: 'el_voice_2' },
		]);

		const filtered = await node.methods.listSearch.searchCustomVoices.call(context, 'MY VOICE');
		assert.deepEqual(
			filtered.results.map((result) => result.value),
			['el_voice_1'],
		);
	});

	it('lists no voices until a model is selected', async () => {
		const context = createLoadOptionsContext({
			currentParameters: { model: '' },
			respond: () => {
				throw new Error('no request expected');
			},
		});
		assert.deepEqual(await node.methods.listSearch.searchCustomVoices.call(context), {
			results: [],
		});
	});
});

describe('3D asset generate', () => {
	const PNG_BYTES = Buffer.from('PNGDATA');

	it('sends a binary image as a data URI and returns the job right away by default', async () => {
		const envelope = { job_id: 'job_3d', status: 'processing', poll_url: '/v1/jobs/job_3d' };
		const { output, context } = await run({
			parameters: {
				resource: 'threeD',
				operation: 'generate',
				model: 'mesh-maker',
				imageSource: 'binaryData',
				binaryPropertyName: 'photo',
				waitForCompletion: false,
				options: {
					resolution: ' 1024 ',
					seed: 42,
					textureSize: '2048',
					decimationTarget: 500000,
					remesh: false,
					maxNumTokens: 49152,
					modelParameters: '{"preprocess_image": true, "image": "ignored"}',
				},
			},
			binary: {
				photo: {
					data: PNG_BYTES.toString('base64'),
					mimeType: 'image/png',
					fileName: 'chair.png',
					fileExtension: 'png',
				},
			},
			respond: () => envelope,
		});

		assert.equal(context.calls.length, 1);
		const [request] = context.calls;
		assert.equal(request.method, 'POST');
		assert.equal(request.url, '/3d/generations');
		assert.deepEqual(request.body, {
			resolution: '1024',
			seed: 42,
			texture_size: '2048',
			decimation_target: 500000,
			remesh: false,
			max_num_tokens: 49152,
			preprocess_image: true,
			model: 'mesh-maker',
			image: `data:image/png;base64,${PNG_BYTES.toString('base64')}`,
		});
		assert.deepEqual(output, [{ json: envelope, pairedItem: { item: 0 } }]);
	});

	it('sends an image URL as it is', async () => {
		const { context } = await run({
			parameters: {
				resource: 'threeD',
				operation: 'generate',
				model: 'mesh-maker',
				imageSource: 'url',
				imageUrl: ' https://files.example/product-photo.png ',
				waitForCompletion: false,
				options: {},
			},
			respond: () => ({ job_id: 'job_3d', status: 'processing' }),
		});
		assert.deepEqual(context.calls[0].body, {
			model: 'mesh-maker',
			image: 'https://files.example/product-photo.png',
		});
	});

	it('sends no image when the model takes its input from Model Parameters', async () => {
		const { context } = await run({
			parameters: {
				resource: 'threeD',
				operation: 'generate',
				model: 'text-mesh',
				imageSource: 'none',
				waitForCompletion: false,
				options: { modelParameters: '{"prompt": "A small wooden chair"}' },
			},
			respond: () => ({ job_id: 'job_3d', status: 'processing' }),
		});
		assert.deepEqual(context.calls[0].body, {
			prompt: 'A small wooden chair',
			model: 'text-mesh',
		});
	});

	it('waits for the job and downloads the 3D file as a binary file', async () => {
		const job = {
			job_id: 'job_3d',
			status: 'completed',
			endpoint: '/v1/3d/generations',
			result: { data: [{ url: 'https://media.example/m/chair.glb?sig=1' }] },
		};
		const { output, context } = await run({
			parameters: {
				resource: 'threeD',
				operation: 'generate',
				model: 'mesh-maker',
				imageSource: 'url',
				imageUrl: 'https://files.example/product-photo.png',
				waitForCompletion: true,
				timeout: 60,
				downloadFile: true,
				options: { binaryPropertyOutput: 'mesh' },
			},
			respond: (request) =>
				request.method === 'POST' ? { job_id: 'job_3d', status: 'processing' } : job,
			download: () => ({
				body: Buffer.from('glTF'),
				headers: { 'content-type': 'model/gltf-binary' },
			}),
		});

		const [start, poll] = context.calls;
		assert.equal(start.url, '/3d/generations');
		assert.equal(poll.method, 'GET');
		assert.equal(poll.url, '/jobs/job_3d');
		assert.equal(context.downloads[0].url, 'https://media.example/m/chair.glb?sig=1');
		assert.equal(context.downloads[0].headers, undefined);

		assert.equal(output.length, 1);
		assert.deepEqual(output[0].json, job);
		assert.equal(Buffer.from(output[0].binary.mesh.data, 'base64').toString(), 'glTF');
		assert.equal(output[0].binary.mesh.fileName, 'model.glb');
		assert.equal(output[0].binary.mesh.mimeType, 'model/gltf-binary');
	});

	it('keeps the extension of a 3D file in another format', async () => {
		const { output } = await run({
			parameters: {
				resource: 'threeD',
				operation: 'generate',
				model: 'mesh-maker',
				imageSource: 'url',
				imageUrl: 'https://files.example/product-photo.png',
				waitForCompletion: true,
				timeout: 60,
				downloadFile: true,
				options: {},
			},
			respond: (request) =>
				request.method === 'POST'
					? { job_id: 'job_obj', status: 'processing' }
					: {
							job_id: 'job_obj',
							status: 'completed',
							result: { data: [{ url: 'https://media.example/m/chair.obj' }] },
						},
			download: () => ({
				body: Buffer.from('v 0 0 0'),
				headers: { 'content-type': 'application/octet-stream' },
			}),
		});
		assert.equal(output[0].binary.data.fileName, 'model.obj');
		assert.equal(output[0].binary.data.mimeType, 'application/octet-stream');
	});

	it('returns the finished job without a download when Download File is off', async () => {
		const { output, context } = await run({
			parameters: {
				resource: 'threeD',
				operation: 'generate',
				model: 'mesh-maker',
				imageSource: 'url',
				imageUrl: 'https://files.example/product-photo.png',
				waitForCompletion: true,
				timeout: 60,
				downloadFile: false,
				options: {},
			},
			respond: (request) =>
				request.method === 'POST'
					? { job_id: 'job_3d', status: 'processing' }
					: { job_id: 'job_3d', status: 'completed', result: { data: [] } },
		});
		assert.equal(context.downloads.length, 0);
		assert.deepEqual(output, [
			{
				json: { job_id: 'job_3d', status: 'completed', result: { data: [] } },
				pairedItem: { item: 0 },
			},
		]);
	});

	it('refuses a binary file that is not an image before any request', async () => {
		await assert.rejects(
			run({
				parameters: {
					resource: 'threeD',
					operation: 'generate',
					model: 'mesh-maker',
					imageSource: 'binaryData',
					binaryPropertyName: 'data',
					waitForCompletion: false,
					options: {},
				},
				binary: {
					data: {
						data: Buffer.from('hello').toString('base64'),
						mimeType: 'text/plain',
						fileName: 'notes.txt',
						fileExtension: 'txt',
					},
				},
				respond: () => {
					throw new Error('no request expected');
				},
			}),
			(error) => error instanceof NodeOperationError && /not an image/.test(error.message),
		);
	});

	it('shows the API message when the job cannot start', async () => {
		await assert.rejects(
			run({
				parameters: {
					resource: 'threeD',
					operation: 'generate',
					model: 'mesh-maker',
					imageSource: 'url',
					imageUrl: 'https://files.example/product-photo.png',
					waitForCompletion: false,
					options: {},
				},
				respond: () => {
					throw apiError(402);
				},
			}),
			(error) => error instanceof NodeApiError && String(error.httpCode) === '402',
		);
	});
});

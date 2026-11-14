import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createExecuteContext, loadDist, n8nWorkflow } from '../helpers/context.mjs';

const transport = loadDist('nodes/Empiriolabs/transport.js');

describe('extractMediaReferences', () => {
	it('reads URLs from an OpenAI-style data array', () => {
		const refs = transport.extractMediaReferences({
			created: 1,
			data: [{ url: 'https://cdn.example.com/a.png' }, { url: 'https://cdn.example.com/b.png' }],
		});
		assert.deepEqual(
			refs.map((ref) => ref.url),
			['https://cdn.example.com/a.png', 'https://cdn.example.com/b.png'],
		);
	});

	it('reads base64 data, including data URIs', () => {
		const refs = transport.extractMediaReferences({
			data: [{ b64_json: 'aGVsbG8=' }, { url: 'data:image/png;base64,aGk=' }],
		});
		assert.equal(refs.length, 1);
		assert.equal(refs[0].base64, 'aGVsbG8=');

		const dataUri = transport.extractMediaReferences({ images: ['data:image/png;base64,aGk='] });
		assert.equal(dataUri[0].base64, 'data:image/png;base64,aGk=');
	});

	it('finds files in a job result and in top-level URL fields', () => {
		assert.equal(
			transport.extractMediaReferences({
				result: { data: [{ url: 'https://cdn.example.com/v.mp4' }] },
			})[0].url,
			'https://cdn.example.com/v.mp4',
		);
		assert.equal(
			transport.extractMediaReferences({ video_url: 'https://cdn.example.com/v.mp4' })[0].url,
			'https://cdn.example.com/v.mp4',
		);
		assert.deepEqual(transport.extractMediaReferences({ text: 'no files here' }), []);
		assert.deepEqual(transport.extractMediaReferences(null), []);
	});
});

describe('job helpers', () => {
	it('normalizes statuses', () => {
		assert.equal(transport.normalizeJobStatus('succeeded'), 'completed');
		assert.equal(transport.normalizeJobStatus('COMPLETED'), 'completed');
		assert.equal(transport.normalizeJobStatus('canceled'), 'cancelled');
		assert.equal(transport.normalizeJobStatus('abandoned'), 'failed');
		assert.equal(transport.normalizeJobStatus('processing'), 'processing');
	});

	it('recognizes a job envelope but not a finished image response', () => {
		assert.equal(transport.isJobEnvelope({ job_id: 'job_1', status: 'processing' }), true);
		assert.equal(transport.isJobEnvelope({ job_id: 'job_1', data: [{ url: 'https://x' }] }), false);
		assert.equal(transport.isJobEnvelope({ created: 1, data: [] }), false);
	});

	it('polls until the job completes', async () => {
		let polls = 0;
		const context = createExecuteContext({
			parameters: {},
			respond: (request) => {
				assert.equal(request.method, 'GET');
				assert.equal(request.url, '/jobs/job_%2F1');
				polls += 1;
				return polls < 3
					? { job_id: 'job_/1', status: 'processing' }
					: { job_id: 'job_/1', status: 'completed', result: { text: 'done' } };
			},
		});
		const job = await transport.waitForJob.call(context, 'job_/1', 30, 0, 0.01);
		assert.equal(job.result.text, 'done');
		assert.equal(polls, 3);
	});

	it('reports a failed job with the API message', async () => {
		const context = createExecuteContext({
			parameters: {},
			respond: () => ({
				job_id: 'job_2',
				status: 'failed',
				error: { message: 'Prompt was rejected' },
			}),
		});
		await assert.rejects(transport.waitForJob.call(context, 'job_2', 30, 0, 0.01), (error) => {
			assert.match(error.message, /job_2 ended with status "failed"/);
			assert.equal(error.description, 'Prompt was rejected');
			return true;
		});
	});

	it('stops at the timeout', async () => {
		const context = createExecuteContext({
			parameters: {},
			respond: () => ({ job_id: 'job_3', status: 'processing' }),
		});
		await assert.rejects(
			transport.waitForJob.call(context, 'job_3', 0.05, 0, 0.01),
			/still running/,
		);
	});
});

describe('buildMultipartBody', () => {
	it('encodes text fields and the file with a boundary', () => {
		const { body, contentType } = transport.buildMultipartBody(
			{ model: 'batch-asr', language: 'en' },
			{
				fieldName: 'file',
				fileName: 'call "1".wav',
				mimeType: 'audio/wav',
				data: Buffer.from('RIFF'),
			},
		);
		const boundary = contentType.split('boundary=')[1];
		assert.ok(boundary.length > 10);
		const text = body.toString('utf8');
		assert.ok(text.startsWith(`--${boundary}\r\n`));
		assert.match(text, /name="model"\r\n\r\nbatch-asr\r\n/);
		assert.match(text, /name="language"\r\n\r\nen\r\n/);
		assert.match(
			text,
			/name="file"; filename="call _1_.wav"\r\nContent-Type: audio\/wav\r\n\r\nRIFF\r\n/,
		);
		assert.ok(text.endsWith(`--${boundary}--\r\n`));
	});

	it('turns non-string values into form text', () => {
		assert.equal(transport.formFieldValue(true), 'true');
		assert.equal(transport.formFieldValue(3), '3');
		assert.equal(transport.formFieldValue({ a: 1 }), '{"a":1}');
	});
});

describe('small helpers', () => {
	it('reads headers without caring about case', () => {
		assert.equal(
			transport.headerValue({ 'Content-Type': 'audio/mpeg' }, 'content-type'),
			'audio/mpeg',
		);
		assert.equal(transport.headerValue(undefined, 'content-type'), '');
	});

	it('maps MIME types and audio formats', () => {
		assert.equal(transport.extensionForMimeType('video/mp4; codecs=avc1'), 'mp4');
		assert.equal(transport.extensionForMimeType('application/x-unknown'), undefined);
		assert.equal(transport.mimeTypeForAudioFormat('WAV'), 'audio/wav');
	});

	it('parses the JSON parameter or explains what to enter', () => {
		const context = createExecuteContext({ parameters: {}, respond: () => ({}) });
		assert.deepEqual(transport.parseJsonObjectParameter.call(context, '{"seed": 4}', 'X', 0), {
			seed: 4,
		});
		assert.deepEqual(transport.parseJsonObjectParameter.call(context, '', 'X', 0), {});
		assert.deepEqual(transport.parseJsonObjectParameter.call(context, { a: 1 }, 'X', 0), { a: 1 });
		assert.throws(
			() => transport.parseJsonObjectParameter.call(context, '[1]', 'X', 0),
			/must be a JSON object/,
		);
		assert.throws(
			() => transport.parseJsonObjectParameter.call(context, '{bad', 'X', 0),
			/must be a JSON object/,
		);
	});

	it('reads lines, JSON parameters and resource locator values', () => {
		assert.deepEqual(transport.splitLines(' one \r\n\r\n two\nthree '), ['one', 'two', 'three']);
		assert.deepEqual(transport.splitLines(undefined), []);
		assert.deepEqual(transport.readJsonParameter('["a"]'), ['a']);
		assert.deepEqual(transport.readJsonParameter({ a: 1 }), { a: 1 });
		assert.equal(transport.readJsonParameter('{bad'), undefined);
		assert.equal(transport.readJsonParameter(''), undefined);
		assert.equal(transport.locatorValue({ __rl: true, mode: 'id', value: ' abc ' }), 'abc');
		assert.equal(transport.locatorValue(' abc '), 'abc');
		assert.equal(transport.locatorValue(undefined), '');
	});

	it('maps file extensions back to MIME types', () => {
		assert.equal(transport.mimeTypeForExtension('GLB'), 'model/gltf-binary');
		assert.equal(transport.mimeTypeForExtension('wav'), 'audio/wav');
		assert.equal(transport.mimeTypeForExtension('obj'), undefined);
		assert.equal(transport.mimeTypeForExtension(undefined), undefined);
	});

	it('builds a template list query from the filters', () => {
		assert.deepEqual(transport.templateListQuery({}), {});
		assert.deepEqual(
			transport.templateListQuery({ category: ' viral ', model: 'reel-video', featured: true }),
			{ category: 'viral', model: 'reel-video', featured: true },
		);
		assert.deepEqual(
			transport.templateListQuery({ category: ' ', model: '', featured: false }),
			{},
		);
	});

	it('sends API requests to the EmpirioLabs AI base URL with the credential', async () => {
		const context = createExecuteContext({ parameters: {}, respond: () => ({ ok: true }) });
		await transport.apiRequest.call(context, 'GET', '/jobs', undefined, { limit: 5 });
		const [call] = context.calls;
		assert.equal(call.credentialName, 'empirioLabsApi');
		assert.equal(call.baseURL, 'https://api.empiriolabs.ai/v1');
		assert.equal(call.url, '/jobs');
		assert.deepEqual(call.qs, { limit: 5 });
		assert.equal(call.json, true);
		assert.equal(call.sendCredentialsOnCrossOriginRedirect, false);
	});

	it('treats an error body with a success status as an error', async () => {
		const body = {
			error: {
				message: 'The request did not complete within 15 minutes. Please try again.',
				type: 'server_error',
				param: null,
				code: 'timeout',
				request_id: 'req_1',
			},
		};
		const context = createExecuteContext({ parameters: {}, respond: () => body });
		await assert.rejects(transport.apiRequest.call(context, 'POST', '/research', {}), (error) => {
			assert.ok(error instanceof n8nWorkflow.NodeApiError);
			assert.equal(
				error.message,
				'The request did not complete within 15 minutes. Please try again.',
			);
			return true;
		});

		assert.equal(transport.errorBodyMessage(body), body.error.message);
		assert.equal(
			transport.errorBodyMessage({ error: { code: 'x', message: 'Unknown model.' } }),
			'Unknown model.',
		);
		// A result that mentions an error, such as a failed job, is a result.
		assert.equal(
			transport.errorBodyMessage({ job_id: 'job_1', status: 'failed', error: { message: 'x' } }),
			undefined,
		);
		assert.equal(transport.errorBodyMessage({ error: 'text' }), undefined);
		assert.equal(transport.errorBodyMessage({ error: {} }), undefined);
		assert.equal(transport.errorBodyMessage({ error: null }), undefined);
		assert.equal(transport.errorBodyMessage({ data: [] }), undefined);

		const job = { job_id: 'job_1', status: 'failed', error: { message: 'Prompt was rejected' } };
		const jobContext = createExecuteContext({ parameters: {}, respond: () => job });
		assert.deepEqual(await transport.apiRequest.call(jobContext, 'GET', '/jobs/job_1'), job);
	});
});

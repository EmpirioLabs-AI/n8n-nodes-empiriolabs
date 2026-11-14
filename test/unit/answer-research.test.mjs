import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createExecuteContext, loadDist, n8nWorkflow } from '../helpers/context.mjs';

const { Empiriolabs } = loadDist('nodes/Empiriolabs/Empiriolabs.node.js');
const { NodeApiError } = n8nWorkflow;

const node = new Empiriolabs();

async function run(options) {
	const context = createExecuteContext(options);
	const [output] = await node.execute.call(context);
	return { output, context };
}

describe('web search answer', () => {
	const answer = {
		object: 'search',
		model: 'answer-model',
		query: 'When was the last total solar eclipse?',
		answer: 'On April 8, 2024.',
		results: [{ title: 'Eclipse', url: 'https://example.com/eclipse', id: 'r1' }],
		usage: { total_tokens: 12 },
	};

	it('sends the question with the options and returns the answer and its sources as they are', async () => {
		const { output, context } = await run({
			parameters: {
				resource: 'webSearch',
				operation: 'answer',
				model: 'answer-model',
				query: '  When was the last total solar eclipse?  ',
				options: {
					includeText: true,
					disableFormatting: false,
					modelParameters: '{"extra": "x", "query": "ignored"}',
				},
			},
			respond: () => answer,
		});

		assert.equal(context.calls.length, 1);
		const [request] = context.calls;
		assert.equal(request.method, 'POST');
		assert.equal(request.url, '/answer');
		assert.deepEqual(request.body, {
			text: true,
			disable_formatting: false,
			extra: 'x',
			model: 'answer-model',
			query: 'When was the last total solar eclipse?',
		});
		assert.deepEqual(output, [{ json: answer, pairedItem: { item: 0 } }]);
	});

	it('sends only the model and the question without options', async () => {
		const { context } = await run({
			parameters: {
				resource: 'webSearch',
				operation: 'answer',
				model: 'answer-model',
				query: 'Who wrote it?',
				options: {},
			},
			respond: () => answer,
		});
		assert.deepEqual(context.calls[0].body, { model: 'answer-model', query: 'Who wrote it?' });
		// The request keeps the default request timeout.
		assert.equal(context.calls[0].timeout, undefined);
	});

	it('shows the API message when the answer is refused', async () => {
		await assert.rejects(
			run({
				parameters: {
					resource: 'webSearch',
					operation: 'answer',
					model: 'answer-model',
					query: 'Who wrote it?',
					options: {},
				},
				respond: () => {
					throw Object.assign(new Error('Request failed with status code 402'), {
						httpCode: '402',
					});
				},
			}),
			(error) => error instanceof NodeApiError && error.context.itemIndex === 0,
		);
	});
});

describe('web search research', () => {
	const report = {
		object: 'search',
		model: 'research-model',
		query: 'How are cities adapting public transport to heat waves?',
		answer: '# Report\n\nCities add shade and cooling [1].',
		results: [{ title: 'Source', url: 'https://example.com/source', content: 'Details.' }],
		usage: { total_tokens: 900 },
	};

	it('sends the question with the options, keeps the request open for the timeout and returns the report', async () => {
		const { output, context } = await run({
			parameters: {
				resource: 'webSearch',
				operation: 'research',
				model: 'research-model',
				query: ' How are cities adapting public transport to heat waves? ',
				options: {
					researchDepth: 'pro',
					citationFormat: 'apa',
					disableFormatting: true,
					timeout: 120,
					modelParameters: '{"include_domains": ["example.com"], "stream": true}',
				},
			},
			respond: () => report,
		});

		assert.equal(context.calls.length, 1);
		const [request] = context.calls;
		assert.equal(request.method, 'POST');
		assert.equal(request.url, '/research');
		// The report is always one response: a stream value in Model Parameters does not change that.
		assert.deepEqual(request.body, {
			tavily_model: 'pro',
			citation_format: 'apa',
			disable_formatting: true,
			include_domains: ['example.com'],
			model: 'research-model',
			query: 'How are cities adapting public transport to heat waves?',
			stream: false,
		});
		assert.equal(request.timeout, 120000);
		assert.deepEqual(output, [{ json: report, pairedItem: { item: 0 } }]);
	});

	it('waits up to 15 minutes by default', async () => {
		const { context } = await run({
			parameters: {
				resource: 'webSearch',
				operation: 'research',
				model: 'research-model',
				query: 'A question',
				options: {},
			},
			respond: () => report,
		});
		assert.deepEqual(context.calls[0].body, {
			model: 'research-model',
			query: 'A question',
			stream: false,
		});
		assert.equal(context.calls[0].timeout, 900000);
		assert.equal('abortSignal' in context.calls[0], false);
	});

	it('ends the open request when the execution is stopped', async () => {
		const controller = new AbortController();
		const context = createExecuteContext({
			parameters: {
				resource: 'webSearch',
				operation: 'research',
				model: 'research-model',
				query: 'A question',
				options: {},
			},
			respond: () => report,
		});
		context.getExecutionCancelSignal = () => controller.signal;
		await node.execute.call(context);
		assert.equal(context.calls[0].abortSignal, controller.signal);
	});

	it('shows the API message when the research is refused', async () => {
		await assert.rejects(
			run({
				parameters: {
					resource: 'webSearch',
					operation: 'research',
					model: 'research-model',
					query: 'A question',
					options: {},
				},
				respond: () => {
					throw Object.assign(new Error('Request failed with status code 500'), {
						httpCode: '500',
					});
				},
			}),
			(error) => error instanceof NodeApiError && error.context.itemIndex === 0,
		);
	});

	const lateError = {
		error: {
			message: 'The request did not complete within 15 minutes. Please try again.',
			type: 'server_error',
			param: null,
			code: 'timeout',
			request_id: 'req_1',
		},
	};
	const parameters = {
		resource: 'webSearch',
		operation: 'research',
		model: 'research-model',
		query: 'A question',
		options: {},
	};

	it('fails with the API message when a long request ends with an error body', async () => {
		await assert.rejects(run({ parameters, respond: () => lateError }), (error) => {
			assert.ok(error instanceof NodeApiError);
			assert.equal(error.context.itemIndex, 0);
			assert.equal(
				error.message,
				'The request did not complete within 15 minutes. Please try again.',
			);
			return true;
		});
	});

	it('returns that message in the item when Continue On Fail is on', async () => {
		const { output } = await run({ parameters, continueOnFail: true, respond: () => lateError });
		assert.deepEqual(output, [
			{
				json: { error: 'The request did not complete within 15 minutes. Please try again.' },
				pairedItem: { item: 0 },
			},
		]);
	});
});

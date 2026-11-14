import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createExecuteContext, loadDist, n8nWorkflow } from '../helpers/context.mjs';

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

function rejectsWith(promise, pattern) {
	return assert.rejects(
		promise,
		(error) => error instanceof NodeOperationError && pattern.test(error.message),
	);
}

describe('decision', () => {
	const FUNCTIONS = [
		{
			type: 'function',
			function: { name: 'reschedule_appointment', parameters: { type: 'object', properties: {} } },
		},
	];

	it('builds every question type from the fields and returns the answers as they are', async () => {
		const answer = {
			model: 'decision-model',
			answers: {
				is_urgent: { type: 'noul', noul: 0.9412, confidence: 0.8824 },
				department: {
					type: 'choice',
					choice: 'billing',
					probabilities: { billing: 0.88, technical: 0.11, sales: 0.01 },
					confidence: 0.82,
				},
			},
			usage: { input_tokens: 212, output_tokens: 0 },
			long_context: 'full',
		};
		const { output, context } = await run({
			parameters: {
				resource: 'decision',
				operation: 'create',
				model: 'decision-model',
				stateType: 'text',
				stateText: 'I was charged twice. Please refund the duplicate charge today.',
				questionsMode: 'fields',
				questions: {
					noul: [
						{
							id: ' is_urgent ',
							instructions: ' Does the customer need a resolution today? ',
							yesCriteria: 'A deadline within a day',
							noCriteria: '',
							abstain: true,
						},
						{ id: 'is_polite', instructions: 'Is the message polite?', abstain: false },
					],
					choice: [
						{
							id: 'department',
							instructions: 'Which team should handle this message?',
							choices:
								'billing: Charges, refunds, and invoices\n technical \n\nsales: Plans: pricing',
							abstain: false,
						},
					],
					score: [
						{
							id: 'frustration',
							instructions: 'How frustrated is the customer?',
							levels: 'Calm\r\nFrustrated\r\n Very angry ',
							abstain: true,
						},
					],
					tool: [
						{
							id: 'next_action',
							instructions: 'Which function should handle this request?',
							tools: JSON.stringify(FUNCTIONS),
							allowNone: false,
						},
					],
				},
				options: { longContext: 'full' },
			},
			respond: () => answer,
		});

		assert.equal(context.calls.length, 1);
		const [request] = context.calls;
		assert.equal(request.method, 'POST');
		assert.equal(request.url, '/decisions');
		assert.deepEqual(request.body, {
			model: 'decision-model',
			state: 'I was charged twice. Please refund the duplicate charge today.',
			questions: {
				is_urgent: {
					type: 'noul',
					instructions: 'Does the customer need a resolution today?',
					criteria: { true: 'A deadline within a day' },
					abstain: true,
				},
				is_polite: { type: 'noul', instructions: 'Is the message polite?' },
				department: {
					type: 'choice',
					instructions: 'Which team should handle this message?',
					criteria: {
						billing: 'Charges, refunds, and invoices',
						technical: null,
						sales: 'Plans: pricing',
					},
				},
				frustration: {
					type: 'score',
					instructions: 'How frustrated is the customer?',
					criteria: ['Calm', 'Frustrated', 'Very angry'],
					abstain: true,
				},
				next_action: {
					type: 'tool',
					instructions: 'Which function should handle this request?',
					tools: FUNCTIONS,
					allow_none: false,
				},
			},
			long_context: 'full',
		});
		assert.deepEqual(output, [{ json: answer, pairedItem: { item: 0 } }]);
	});

	it('sends a JSON state and JSON questions as given', async () => {
		const state = {
			listing_title: 'Three-seat leather sofa',
			photo: { type: 'image', url: 'https://files.example/listing-photo.png' },
		};
		const questions = {
			matches_title: { type: 'noul', instructions: 'Does the photo show the item?' },
		};
		const { context } = await run({
			parameters: {
				resource: 'decision',
				operation: 'create',
				model: 'decision-model',
				stateType: 'json',
				stateJson: JSON.stringify(state),
				questionsMode: 'json',
				questionsJson: questions,
				options: {},
			},
			respond: () => ({ model: 'decision-model', answers: {} }),
		});
		assert.deepEqual(context.calls[0].body, { model: 'decision-model', state, questions });
	});

	it('accepts a JSON array as the state', async () => {
		const { context } = await run({
			parameters: {
				resource: 'decision',
				operation: 'create',
				model: 'decision-model',
				stateType: 'json',
				stateJson: '["first message", "second message"]',
				questionsMode: 'json',
				questionsJson: '{"q": {"type": "noul", "instructions": "Is it urgent?"}}',
				options: {},
			},
			respond: () => ({ answers: {} }),
		});
		assert.deepEqual(context.calls[0].body.state, ['first message', 'second message']);
	});

	const base = {
		resource: 'decision',
		operation: 'create',
		model: 'decision-model',
		stateType: 'text',
		stateText: 'A message',
		questionsMode: 'fields',
		options: {},
	};
	const noRequest = () => {
		throw new Error('no request expected');
	};

	it('asks for at least one question', async () => {
		await rejectsWith(
			run({ parameters: { ...base, questions: {} }, respond: noRequest }),
			/at least one question/,
		);
		await rejectsWith(
			run({
				parameters: { ...base, questionsMode: 'json', questionsJson: '{}' },
				respond: noRequest,
			}),
			/Questions \(JSON\) must be a JSON object/,
		);
	});

	it('names the question that is incomplete', async () => {
		await rejectsWith(
			run({
				parameters: { ...base, questions: { score: [{ id: '', instructions: 'Rate it' }] } },
				respond: noRequest,
			}),
			/A Score question has no ID/,
		);
		await rejectsWith(
			run({
				parameters: { ...base, questions: { noul: [{ id: 'q1', instructions: '  ' }] } },
				respond: noRequest,
			}),
			/"q1" has no instructions/,
		);
		await rejectsWith(
			run({
				parameters: {
					...base,
					questions: { choice: [{ id: 'team', instructions: 'Which team?', choices: 'billing' }] },
				},
				respond: noRequest,
			}),
			/"team" needs at least two options/,
		);
		await rejectsWith(
			run({
				parameters: {
					...base,
					questions: { score: [{ id: 'mood', instructions: 'How angry?', levels: 'Calm' }] },
				},
				respond: noRequest,
			}),
			/"mood" needs at least two levels/,
		);
		await rejectsWith(
			run({
				parameters: {
					...base,
					questions: { tool: [{ id: 'act', instructions: 'Which function?', tools: '{}' }] },
				},
				respond: noRequest,
			}),
			/"act" needs at least one function/,
		);
		await rejectsWith(
			run({
				parameters: {
					...base,
					questions: {
						noul: [{ id: 'same', instructions: 'First?' }],
						score: [{ id: 'same', instructions: 'Second?', levels: 'Low\nHigh' }],
					},
				},
				respond: noRequest,
			}),
			/"same" is used more than once/,
		);
	});

	it('refuses a JSON state that is not an object or an array', async () => {
		await rejectsWith(
			run({
				parameters: {
					...base,
					stateType: 'json',
					stateJson: '"just text"',
					questions: { noul: [{ id: 'q', instructions: 'Is it?' }] },
				},
				respond: noRequest,
			}),
			/State \(JSON\) must be a JSON object or array/,
		);
	});

	it('shows the API message when the decision is refused', async () => {
		await assert.rejects(
			run({
				parameters: { ...base, questions: { noul: [{ id: 'q', instructions: 'Is it?' }] } },
				respond: () => {
					throw apiError(422);
				},
			}),
			(error) => error instanceof NodeApiError && error.context.itemIndex === 0,
		);
	});
});

describe('detection', () => {
	it('sends the text as input with the options and returns the result as it is', async () => {
		const result = {
			object: 'detection',
			model: 'detect-model',
			scan_type: 'ai_detection',
			result: { documents: [{ predicted_class: 'human' }] },
			usage: { words: 9 },
		};
		const { output, context } = await run({
			parameters: {
				resource: 'detection',
				operation: 'detect',
				model: 'detect-model',
				text: 'The quick brown fox jumps over the lazy dog.',
				options: {
					version: ' 2026-01-01-base ',
					modelParameters: '{"scan_type": "ai_detection", "input": "ignored"}',
				},
			},
			respond: () => result,
		});

		assert.equal(context.calls.length, 1);
		const [request] = context.calls;
		assert.equal(request.method, 'POST');
		assert.equal(request.url, '/detect');
		assert.deepEqual(request.body, {
			version: '2026-01-01-base',
			scan_type: 'ai_detection',
			model: 'detect-model',
			input: 'The quick brown fox jumps over the lazy dog.',
		});
		assert.deepEqual(output, [{ json: result, pairedItem: { item: 0 } }]);
	});

	it('sends only the model and the text without options', async () => {
		const { context } = await run({
			parameters: {
				resource: 'detection',
				operation: 'detect',
				model: 'detect-model',
				text: 'Some text',
				options: {},
			},
			respond: () => ({ object: 'detection' }),
		});
		assert.deepEqual(context.calls[0].body, { model: 'detect-model', input: 'Some text' });
	});

	it('shows the API message when the scan is refused', async () => {
		await assert.rejects(
			run({
				parameters: {
					resource: 'detection',
					operation: 'detect',
					model: 'detect-model',
					text: 'Some text',
					options: {},
				},
				respond: () => {
					throw apiError(400);
				},
			}),
			(error) => error instanceof NodeApiError && error.context.itemIndex === 0,
		);
	});

	it('explains Model Parameters that are not a JSON object', async () => {
		await rejectsWith(
			run({
				parameters: {
					resource: 'detection',
					operation: 'detect',
					model: 'detect-model',
					text: 'Some text',
					options: { modelParameters: '[1]' },
				},
				respond: () => {
					throw new Error('no request expected');
				},
			}),
			/Model Parameters \(JSON\) must be a JSON object/,
		);
	});
});

describe('rerank', () => {
	const response = {
		object: 'list',
		model: 'rerank-model',
		results: [
			{ index: 2, relevance_score: 0.93, document: { text: 'Returned third text' } },
			{ index: 0, relevance_score: 0.34 },
		],
		usage: { total_tokens: 79 },
	};

	it('sends the documents from the fields and returns one item per ranked document', async () => {
		const { output, context } = await run({
			parameters: {
				resource: 'rerank',
				operation: 'rerank',
				model: 'rerank-model',
				query: 'What is a rerank model?',
				documentsMode: 'fields',
				documents: {
					values: [
						{ text: 'First text' },
						{ text: '   ' },
						{ text: 'Second text' },
						{ text: 'Third text' },
					],
				},
				simplify: true,
				options: {
					topN: 2,
					instruct: ' Retrieve semantically similar text. ',
					returnDocuments: true,
					modelParameters: '{"extra": 1, "documents": ["ignored"]}',
				},
			},
			respond: () => response,
		});

		assert.equal(context.calls.length, 1);
		const [request] = context.calls;
		assert.equal(request.method, 'POST');
		assert.equal(request.url, '/reranks');
		assert.deepEqual(request.body, {
			top_n: 2,
			instruct: 'Retrieve semantically similar text.',
			return_documents: true,
			extra: 1,
			model: 'rerank-model',
			query: 'What is a rerank model?',
			documents: ['First text', 'Second text', 'Third text'],
		});
		// The text comes from the response when it has it, otherwise from the documents sent.
		assert.deepEqual(output, [
			{
				json: { index: 2, relevance_score: 0.93, text: 'Returned third text' },
				pairedItem: { item: 0 },
			},
			{ json: { index: 0, relevance_score: 0.34, text: 'First text' }, pairedItem: { item: 0 } },
		]);
	});

	it('takes the documents as a JSON array and can return the raw response', async () => {
		const { output, context } = await run({
			parameters: {
				resource: 'rerank',
				operation: 'rerank',
				model: 'rerank-model',
				query: 'pricing',
				documentsMode: 'json',
				documentsJson: '["Alpha", "Beta"]',
				simplify: false,
				options: {},
			},
			respond: () => response,
		});
		assert.deepEqual(context.calls[0].body, {
			model: 'rerank-model',
			query: 'pricing',
			documents: ['Alpha', 'Beta'],
		});
		assert.deepEqual(output, [{ json: response, pairedItem: { item: 0 } }]);
	});

	it('takes a list mapped from an earlier node', async () => {
		const { context } = await run({
			parameters: {
				resource: 'rerank',
				operation: 'rerank',
				model: 'rerank-model',
				query: 'pricing',
				documentsMode: 'json',
				documentsJson: ['Alpha', 'Beta', 'Gamma'],
				simplify: true,
				options: {},
			},
			respond: () => ({ results: [] }),
		});
		assert.deepEqual(context.calls[0].body.documents, ['Alpha', 'Beta', 'Gamma']);
	});

	const noRequest = () => {
		throw new Error('no request expected');
	};

	it('asks for documents when there are none', async () => {
		await rejectsWith(
			run({
				parameters: {
					resource: 'rerank',
					operation: 'rerank',
					model: 'rerank-model',
					query: 'pricing',
					documentsMode: 'fields',
					documents: {},
					options: {},
				},
				respond: noRequest,
			}),
			/at least one document/,
		);
	});

	it('refuses documents that are not a JSON array of texts', async () => {
		for (const documentsJson of ['{"a": 1}', '[{"text": "Alpha"}]', 'not json']) {
			await rejectsWith(
				run({
					parameters: {
						resource: 'rerank',
						operation: 'rerank',
						model: 'rerank-model',
						query: 'pricing',
						documentsMode: 'json',
						documentsJson,
						options: {},
					},
					respond: noRequest,
				}),
				/Documents \(JSON\) must be a JSON array of texts/,
			);
		}
	});

	it('shows the API message when the request is refused', async () => {
		await assert.rejects(
			run({
				parameters: {
					resource: 'rerank',
					operation: 'rerank',
					model: 'rerank-model',
					query: 'pricing',
					documentsMode: 'json',
					documentsJson: '["Alpha"]',
					simplify: true,
					options: {},
				},
				respond: () => {
					throw apiError(429);
				},
			}),
			(error) => error instanceof NodeApiError && error.context.itemIndex === 0,
		);
	});
});

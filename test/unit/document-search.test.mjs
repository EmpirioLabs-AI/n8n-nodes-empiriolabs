import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
	createExecuteContext,
	createLoadOptionsContext,
	loadDist,
	n8nWorkflow,
} from '../helpers/context.mjs';

const { Empiriolabs } = loadDist('nodes/Empiriolabs/Empiriolabs.node.js');
const { NodeOperationError } = n8nWorkflow;

const node = new Empiriolabs();

async function run(options) {
	const context = createExecuteContext(options);
	const [output] = await node.execute.call(context);
	return { output, context };
}

const PAGES = [
	{ index: 0, markdown: '# Invoice 42\n\nTotal: 120.00 EUR', images: [], dimensions: {} },
	{ index: 1, markdown: '  ', images: [], dimensions: {} },
	{ index: 2, markdown: 'Paid by bank transfer.', images: [], dimensions: {} },
];
const PAGES_TEXT = '# Invoice 42\n\nTotal: 120.00 EUR\n\nPaid by bank transfer.';
const PDF_BYTES = Buffer.from('%PDF-1.7');

describe('document', () => {
	it('reads a binary PDF as a data URI and joins the pages into text', async () => {
		const { output, context } = await run({
			parameters: {
				resource: 'document',
				operation: 'read',
				model: 'ocr-model',
				inputSource: 'binaryData',
				binaryPropertyName: 'attachment_0',
				waitForCompletion: true,
				options: {
					pages: ' 0,2-4 ',
					tableFormat: 'html',
					extractHeader: true,
					imageLimit: 3,
					imageMinSize: 0,
					modelParameters: '{"include_blocks": false}',
				},
			},
			binary: {
				attachment_0: {
					data: PDF_BYTES.toString('base64'),
					mimeType: 'application/pdf',
					fileName: 'invoice.pdf',
					fileExtension: 'pdf',
				},
			},
			respond: () => ({ pages: PAGES, model: 'ocr-model', usage_info: { pages_processed: 3 } }),
		});

		assert.equal(context.calls.length, 1);
		const [request] = context.calls;
		assert.equal(request.method, 'POST');
		assert.equal(request.url, '/ocr');
		assert.deepEqual(request.body, {
			pages: '0,2-4',
			table_format: 'html',
			extract_header: true,
			image_limit: 3,
			include_blocks: false,
			model: 'ocr-model',
			document: {
				type: 'document_url',
				document_url: `data:application/pdf;base64,${PDF_BYTES.toString('base64')}`,
			},
		});
		assert.equal(output[0].json.text, PAGES_TEXT);
		assert.deepEqual(output[0].json.pages, PAGES);
		assert.equal(output[0].json.model, 'ocr-model');
	});

	it('reads an image from a URL as image_url', async () => {
		const { context } = await run({
			parameters: {
				resource: 'document',
				operation: 'read',
				model: 'ocr-model',
				inputSource: 'url',
				fileUrl: ' https://files.example/receipt.png ',
				fileType: 'image',
				waitForCompletion: true,
				options: {},
			},
			respond: () => ({ pages: [] }),
		});
		assert.deepEqual(context.calls[0].body, {
			model: 'ocr-model',
			document: { type: 'image_url', image_url: 'https://files.example/receipt.png' },
		});
	});

	it('refuses a file that is neither a PDF nor a supported image', async () => {
		await assert.rejects(
			run({
				parameters: {
					resource: 'document',
					operation: 'read',
					model: 'ocr-model',
					inputSource: 'binaryData',
					binaryPropertyName: 'data',
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
			(error) =>
				error instanceof NodeOperationError && /not a PDF or a supported image/.test(error.message),
		);
	});

	it('waits for a long document that comes back as a job', async () => {
		const { output, context } = await run({
			parameters: {
				resource: 'document',
				operation: 'read',
				model: 'ocr-model',
				inputSource: 'url',
				fileUrl: 'https://files.example/report.pdf',
				fileType: 'pdf',
				waitForCompletion: true,
				options: { timeout: 60 },
			},
			respond: (request) =>
				request.method === 'POST'
					? { job_id: 'job_ocr', status: 'processing', poll_url: '/v1/jobs/job_ocr' }
					: {
							job_id: 'job_ocr',
							status: 'completed',
							result: { pages: PAGES, model: 'ocr-model' },
						},
		});
		const [start, poll] = context.calls;
		assert.equal(start.url, '/ocr');
		assert.equal(poll.url, '/jobs/job_ocr');
		assert.equal(output[0].json.job_id, 'job_ocr');
		assert.equal(output[0].json.text, PAGES_TEXT);
	});

	it('can return the job without waiting', async () => {
		const { output, context } = await run({
			parameters: {
				resource: 'document',
				operation: 'read',
				model: 'ocr-model',
				inputSource: 'url',
				fileUrl: 'https://files.example/report.pdf',
				fileType: 'pdf',
				waitForCompletion: false,
				options: {},
			},
			respond: () => ({ job_id: 'job_ocr', status: 'processing', poll_url: '/v1/jobs/job_ocr' }),
		});
		assert.equal(context.calls.length, 1);
		assert.equal(output[0].json.job_id, 'job_ocr');
	});
});

describe('web search', () => {
	it('sends the query with the model parameters and returns the answer as is', async () => {
		const answer = {
			results: [{ title: 'Acme ships a model', url: 'https://example.com/acme', content: 'Details.' }],
		};
		const { output, context } = await run({
			parameters: {
				resource: 'webSearch',
				operation: 'search',
				model: 'search-model',
				query: '  open-weight model releases  ',
				waitForCompletion: true,
				options: { modelParameters: '{"max_results": 5, "model": "ignored"}' },
			},
			respond: () => answer,
		});
		assert.equal(context.calls[0].url, '/search');
		assert.deepEqual(context.calls[0].body, {
			max_results: 5,
			model: 'search-model',
			query: 'open-weight model releases',
		});
		assert.deepEqual(output[0].json, answer);
	});

	it('waits for a search that runs as a job', async () => {
		const { output, context } = await run({
			parameters: {
				resource: 'webSearch',
				operation: 'search',
				model: 'search-model',
				query: 'deep question',
				waitForCompletion: true,
				options: {},
			},
			respond: (request) =>
				request.method === 'POST'
					? { job_id: 'job_search', status: 'processing' }
					: { job_id: 'job_search', status: 'completed', result: { answer: 'Yes.' } },
		});
		assert.equal(context.calls[1].url, '/jobs/job_search');
		assert.deepEqual(output[0].json, { answer: 'Yes.', job_id: 'job_search' });
	});
});

describe('document and search model lists', () => {
	const catalog = {
		object: 'list',
		data: [
			{
				id: 'ocr-model',
				display_name: 'OCR Model',
				category: 'ocr',
				status: 'available',
				supported_endpoints: ['POST /v1/ocr'],
			},
			{
				id: 'search-model',
				display_name: 'Search Model',
				category: 'research',
				status: 'available',
				supported_endpoints: ['POST /v1/search'],
			},
			{
				id: 'answer-model',
				display_name: 'Answer Model',
				category: 'research',
				status: 'available',
				supported_endpoints: ['POST /v1/chat/completions'],
			},
			{ id: 'old-ocr', display_name: 'Old OCR', category: 'ocr', status: 'available' },
		],
	};

	it('lists the models that serve /v1/ocr, and OCR models without an endpoint list', async () => {
		const context = createLoadOptionsContext({ respond: () => catalog });
		const options = await node.methods.loadOptions.getDocumentModels.call(context);
		assert.deepEqual(
			options.map((option) => option.value),
			['ocr-model', 'old-ocr'],
		);
	});

	it('lists only the models that serve /v1/search', async () => {
		const context = createLoadOptionsContext({ respond: () => catalog });
		const options = await node.methods.loadOptions.getSearchModels.call(context);
		assert.deepEqual(
			options.map((option) => option.value),
			['search-model'],
		);
	});
});

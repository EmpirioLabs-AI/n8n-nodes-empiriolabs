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

const PNG_BYTES = Buffer.from('PNGDATA');
const TEMPLATES = [
	{
		slug: 'studio-product-shot',
		display_name: 'Studio Product Shot',
		category: 'product',
		description: 'A product on a clean studio background.',
		modality: 'image',
		recommended_model: 'pixel-image',
		supported_models: ['pixel-image'],
	},
	{
		slug: 'background-swap',
		display_name: 'Background Swap',
		category: 'edit',
		modality: 'image',
		recommended_model: 'pixel-image',
		supported_models: ['pixel-image', 'other-image'],
	},
	{ slug: 'portrait-light', category: 'portrait', modality: 'image' },
];

describe('image analyze', () => {
	it('sends a binary image as a data URI with the question and returns the answer', async () => {
		const answer = {
			analysis: 'A grey cat asleep on a red sofa.',
			model: 'vision-chat',
			usage: { images_analyzed: 1, prompt_tokens: 1234, completion_tokens: 12, total_tokens: 1246 },
		};
		const { output, context } = await run({
			parameters: {
				resource: 'image',
				operation: 'analyze',
				model: 'vision-chat',
				inputSource: 'binaryData',
				binaryPropertyName: 'photo',
				question: 'What is in this picture?',
				options: { temperature: 0, topP: 0.9, seed: 7 },
			},
			binary: {
				photo: {
					data: PNG_BYTES.toString('base64'),
					mimeType: 'image/png',
					fileName: 'cat.png',
					fileExtension: 'png',
				},
			},
			respond: () => answer,
		});

		assert.equal(context.calls.length, 1);
		const [request] = context.calls;
		assert.equal(request.method, 'POST');
		assert.equal(request.url, '/images/analysis');
		assert.equal(request.baseURL, 'https://api.empiriolabs.ai/v1');
		assert.deepEqual(request.body, {
			analysis_temperature: 0,
			analysis_top_p: 0.9,
			analysis_seed: 7,
			model: 'vision-chat',
			image_url: `data:image/png;base64,${PNG_BYTES.toString('base64')}`,
			question: 'What is in this picture?',
		});
		assert.deepEqual(output, [{ json: answer, pairedItem: { item: 0 } }]);
	});

	it('sends an image URL as it is and no option that was not set', async () => {
		const { context } = await run({
			parameters: {
				resource: 'image',
				operation: 'analyze',
				model: 'vision-chat',
				inputSource: 'url',
				imageUrl: ' https://files.example/receipt.png ',
				question: 'Transcribe every line of this receipt.',
				options: {},
			},
			respond: () => ({ analysis: 'Total 7.75', model: 'vision-chat' }),
		});
		assert.deepEqual(context.calls[0].body, {
			model: 'vision-chat',
			image_url: 'https://files.example/receipt.png',
			question: 'Transcribe every line of this receipt.',
		});
	});

	it('reads the image type from the file extension when the MIME type is generic', async () => {
		const { context } = await run({
			parameters: {
				resource: 'image',
				operation: 'analyze',
				model: 'vision-chat',
				inputSource: 'binaryData',
				binaryPropertyName: 'data',
				question: 'Describe it',
				options: {},
			},
			binary: {
				data: {
					data: PNG_BYTES.toString('base64'),
					mimeType: 'application/octet-stream',
					fileName: 'scan.JPG',
					fileExtension: 'JPG',
				},
			},
			respond: () => ({ analysis: 'ok' }),
		});
		assert.equal(
			context.calls[0].body.image_url,
			`data:image/jpeg;base64,${PNG_BYTES.toString('base64')}`,
		);
	});

	it('refuses a binary file that is not an image before any request', async () => {
		await assert.rejects(
			run({
				parameters: {
					resource: 'image',
					operation: 'analyze',
					model: 'vision-chat',
					inputSource: 'binaryData',
					binaryPropertyName: 'data',
					question: 'Describe it',
					options: {},
				},
				binary: {
					data: {
						data: Buffer.from('%PDF-1.7').toString('base64'),
						mimeType: 'application/pdf',
						fileName: 'report.pdf',
						fileExtension: 'pdf',
					},
				},
				respond: () => {
					throw new Error('no request expected');
				},
			}),
			(error) => error instanceof NodeOperationError && /not an image/.test(error.message),
		);
	});
});

describe('image edit', () => {
	it('sends one image URL as text with sync on and returns each edited image as binary', async () => {
		const { output, context } = await run({
			parameters: {
				resource: 'image',
				operation: 'edit',
				model: 'edit-image',
				imageUrls: ' https://files.example/source.jpg ',
				prompt: 'Add a soft pink sunset to the sky',
				waitForCompletion: true,
				options: {
					modelParameters: '{"num_images": 2, "sync": false, "model": "ignored"}',
					binaryPropertyOutput: 'edited',
				},
			},
			respond: () => ({
				created: 1,
				model: 'edit-image',
				data: [
					{ url: 'https://media.example/out/edit-1.png?sig=abc' },
					{ b64_json: Buffer.from('second').toString('base64') },
				],
			}),
			download: () => ({ body: Buffer.from('first'), headers: { 'content-type': 'image/png' } }),
		});

		assert.equal(context.calls.length, 1);
		const [request] = context.calls;
		assert.equal(request.method, 'POST');
		assert.equal(request.url, '/images/edits');
		assert.deepEqual(request.body, {
			num_images: 2,
			model: 'edit-image',
			prompt: 'Add a soft pink sunset to the sky',
			image: 'https://files.example/source.jpg',
			sync: true,
		});
		// The signed file URL is downloaded without the API credential.
		assert.equal(context.downloads.length, 1);
		assert.equal(context.downloads[0].url, 'https://media.example/out/edit-1.png?sig=abc');
		assert.equal(context.downloads[0].headers, undefined);

		assert.equal(output.length, 2);
		assert.deepEqual(output[0].json, {
			model: 'edit-image',
			prompt: 'Add a soft pink sunset to the sky',
			index: 0,
			url: 'https://media.example/out/edit-1.png?sig=abc',
		});
		assert.equal(Buffer.from(output[0].binary.edited.data, 'base64').toString(), 'first');
		assert.equal(output[0].binary.edited.fileName, 'image-1.png');
		assert.equal(output[0].binary.edited.mimeType, 'image/png');
		assert.equal(output[1].json.url, null);
		assert.equal(Buffer.from(output[1].binary.edited.data, 'base64').toString(), 'second');
		assert.deepEqual(output[1].pairedItem, { item: 0 });
	});

	it('sends several image URLs as a list', async () => {
		const { context } = await run({
			parameters: {
				resource: 'image',
				operation: 'edit',
				model: 'edit-image',
				imageUrls: 'https://files.example/a.png, https://files.example/b.png,',
				prompt: 'Place the product on the table',
				waitForCompletion: true,
				options: {},
			},
			respond: () => ({ data: [{ b64_json: Buffer.from('x').toString('base64') }] }),
		});
		assert.deepEqual(context.calls[0].body.image, [
			'https://files.example/a.png',
			'https://files.example/b.png',
		]);
	});

	it('waits for the job when the edit is still running after the request', async () => {
		const { output, context } = await run({
			parameters: {
				resource: 'image',
				operation: 'edit',
				model: 'edit-image',
				imageUrls: 'https://files.example/source.jpg',
				prompt: 'A slow edit',
				waitForCompletion: true,
				options: { timeout: 60 },
			},
			respond: (request) =>
				request.method === 'POST'
					? { job_id: 'job_edit', status: 'processing', poll_url: '/v1/jobs/job_edit' }
					: {
							job_id: 'job_edit',
							status: 'completed',
							result: { data: [{ b64_json: Buffer.from('img').toString('base64') }] },
						},
		});
		const [start, poll] = context.calls;
		assert.equal(start.url, '/images/edits');
		assert.equal(poll.method, 'GET');
		assert.equal(poll.url, '/jobs/job_edit');
		assert.equal(Buffer.from(output[0].binary.data.data, 'base64').toString(), 'img');
	});

	it('asks for the job at once and returns it when Wait for Completion is off', async () => {
		const envelope = { job_id: 'job_edit', status: 'processing', poll_url: '/v1/jobs/job_edit' };
		const { output, context } = await run({
			parameters: {
				resource: 'image',
				operation: 'edit',
				model: 'edit-image',
				imageUrls: 'https://files.example/source.jpg',
				prompt: 'Make it night',
				waitForCompletion: false,
				options: {},
			},
			respond: () => envelope,
		});
		assert.equal(context.calls.length, 1);
		assert.deepEqual(context.calls[0].body, {
			model: 'edit-image',
			prompt: 'Make it night',
			image: 'https://files.example/source.jpg',
			sync: false,
		});
		assert.deepEqual(output, [{ json: envelope, pairedItem: { item: 0 } }]);
	});

	it('explains a response without images', async () => {
		await assert.rejects(
			run({
				parameters: {
					resource: 'image',
					operation: 'edit',
					model: 'edit-image',
					imageUrls: 'https://files.example/source.jpg',
					prompt: 'Make it night',
					waitForCompletion: true,
					options: {},
				},
				respond: () => ({ created: 1, data: [] }),
			}),
			(error) =>
				error instanceof NodeOperationError && /did not include any images/.test(error.message),
		);
	});

	it('asks for an image URL when the field holds none', async () => {
		await assert.rejects(
			run({
				parameters: {
					resource: 'image',
					operation: 'edit',
					model: 'edit-image',
					imageUrls: ' , ',
					prompt: 'Make it night',
					waitForCompletion: true,
					options: {},
				},
				respond: () => {
					throw new Error('no request expected');
				},
			}),
			(error) =>
				error instanceof NodeOperationError && /URL of the image to edit/.test(error.message),
		);
	});

	it('shows the API message when the edit is refused', async () => {
		await assert.rejects(
			run({
				parameters: {
					resource: 'image',
					operation: 'edit',
					model: 'edit-image',
					imageUrls: 'https://files.example/source.jpg',
					prompt: 'Make it night',
					waitForCompletion: true,
					options: {},
				},
				respond: () => {
					throw Object.assign(new Error('Request failed with status code 400'), {
						httpCode: '400',
					});
				},
			}),
			(error) => error instanceof NodeApiError && error.context.itemIndex === 0,
		);
	});
});

for (const [resource, path, modelsMethod, templatesMethod] of [
	['image', '/images/templates', 'getImageModels', 'getImageTemplates'],
	['video', '/videos/templates', 'getVideoModels', 'getVideoTemplates'],
]) {
	describe(`${resource} templates`, () => {
		it('gets many templates with the filters as the query and one item per template', async () => {
			const { output, context } = await run({
				parameters: {
					resource,
					operation: 'getAllTemplates',
					returnAll: false,
					limit: 2,
					filters: { category: ' product ', featured: true, model: 'pixel-image' },
				},
				respond: () => ({ object: 'list', template_count: 3, data: TEMPLATES }),
			});

			assert.equal(context.calls.length, 1);
			const [request] = context.calls;
			assert.equal(request.method, 'GET');
			assert.equal(request.url, path);
			assert.equal(request.body, undefined);
			assert.deepEqual(request.qs, { category: 'product', model: 'pixel-image', featured: true });
			assert.deepEqual(output, [
				{ json: TEMPLATES[0], pairedItem: { item: 0 } },
				{ json: TEMPLATES[1], pairedItem: { item: 0 } },
			]);
		});

		it('sends no query without filters, leaves out a featured filter that is off, and can return all', async () => {
			const { output, context } = await run({
				parameters: {
					resource,
					operation: 'getAllTemplates',
					returnAll: true,
					filters: { featured: false, category: '' },
				},
				respond: () => ({ object: 'list', template_count: 3, data: TEMPLATES }),
			});
			assert.equal(context.calls[0].qs, undefined);
			assert.deepEqual(
				output.map((item) => item.json.slug),
				['studio-product-shot', 'background-swap', 'portrait-light'],
			);
		});

		it('gets one template by its ID', async () => {
			const { output, context } = await run({
				parameters: { resource, operation: 'getTemplate', template: ' background swap/2 ' },
				respond: () => TEMPLATES[1],
			});
			assert.equal(context.calls.length, 1);
			assert.equal(context.calls[0].method, 'GET');
			assert.equal(context.calls[0].url, `${path}/background%20swap%2F2`);
			assert.equal(context.calls[0].qs, undefined);
			assert.deepEqual(output, [{ json: TEMPLATES[1], pairedItem: { item: 0 } }]);
		});

		it('asks for a template when none is given', async () => {
			await assert.rejects(
				run({
					parameters: { resource, operation: 'getTemplate', template: '  ' },
					respond: () => {
						throw new Error('no request expected');
					},
				}),
				(error) => error instanceof NodeOperationError && /Select a template/.test(error.message),
			);
		});

		it('shows the API message for a template that does not exist', async () => {
			await assert.rejects(
				run({
					parameters: { resource, operation: 'getTemplate', template: 'missing' },
					respond: () => {
						throw Object.assign(new Error('Request failed with status code 404'), {
							httpCode: '404',
						});
					},
				}),
				(error) => error instanceof NodeApiError && String(error.httpCode) === '404',
			);
		});

		it('lists the templates and the models of the template filter from the API', async () => {
			const templateContext = createLoadOptionsContext({
				respond: () => ({ object: 'list', data: TEMPLATES }),
			});
			const options = await node.methods.loadOptions[templatesMethod].call(templateContext);
			assert.equal(templateContext.calls.length, 1);
			assert.equal(templateContext.calls[0].method, 'GET');
			assert.equal(templateContext.calls[0].url, path);
			assert.deepEqual(options, [
				{ name: 'Background Swap', value: 'background-swap', description: 'ID: background-swap.' },
				{ name: 'portrait-light', value: 'portrait-light', description: 'ID: portrait-light.' },
				{
					name: 'Studio Product Shot',
					value: 'studio-product-shot',
					description: 'ID: studio-product-shot. A product on a clean studio background.',
				},
			]);

			const fields = node.description.properties.filter(
				(property) =>
					property.displayOptions?.show?.resource?.[0] === resource &&
					['template', 'filters'].includes(property.name),
			);
			const template = fields.find((field) => field.name === 'template');
			assert.equal(template.typeOptions.loadOptionsMethod, templatesMethod);
			const filters = fields.find(
				(field) =>
					field.name === 'filters' && field.displayOptions.show.operation[0] === 'getAllTemplates',
			);
			const modelFilter = filters.options.find((option) => option.name === 'model');
			assert.equal(modelFilter.typeOptions.loadOptionsMethod, modelsMethod);
		});
	});
}

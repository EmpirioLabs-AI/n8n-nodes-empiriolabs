import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CATALOG_FIXTURE, createLoadOptionsContext, loadDist } from '../helpers/context.mjs';

const loadOptions = loadDist('nodes/Empiriolabs/methods/loadOptions.js');

function catalogContext(currentParameters = {}) {
	return createLoadOptionsContext({
		currentParameters,
		respond: (request) => {
			if (request.url === '/models') {
				return CATALOG_FIXTURE;
			}
			const id = decodeURIComponent(request.url.replace('/models/', ''));
			return CATALOG_FIXTURE.data.find((model) => model.id === id);
		},
	});
}

describe('model lists come from the live catalog', () => {
	it('lists chat models by endpoint, sorted, without unavailable models', async () => {
		const context = catalogContext();
		const options = await loadOptions.getChatModels.call(context);
		assert.deepEqual(
			options.map((option) => option.value),
			['alpha-chat', 'omni-speech', 'zeta-chat'],
		);
		assert.equal(context.calls[0].url, '/models');
		assert.equal(context.calls[0].credentialName, 'empirioLabsApi');
		assert.match(
			options[0].description,
			/^ID: alpha-chat\. Another chat model\. Retires on 2026-12-01\.$/,
		);
	});

	it('lists models for each modality by the endpoint they support', async () => {
		const context = catalogContext();
		assert.deepEqual(
			(await loadOptions.getImageModels.call(context)).map((o) => o.value),
			['pixel-image'],
		);
		assert.deepEqual(
			(await loadOptions.getVideoModels.call(context)).map((o) => o.value),
			['reel-video'],
		);
		assert.deepEqual(
			(await loadOptions.getSpeechModels.call(context)).map((o) => o.value),
			['omni-speech'],
		);
		// A realtime-only transcription model cannot serve the REST endpoint.
		assert.deepEqual(
			(await loadOptions.getTranscriptionModels.call(context)).map((o) => o.value),
			['batch-asr'],
		);
		// Entries without endpoint metadata fall back to their category.
		assert.deepEqual(
			(await loadOptions.getEmbeddingModels.call(context)).map((o) => o.value),
			['legacy-embed'],
		);
	});

	it('lists the voices the selected model declares', async () => {
		const voices = await loadOptions.getVoices.call(catalogContext({ model: 'omni-speech' }));
		assert.deepEqual(voices, [
			{ name: 'Model Default', value: '' },
			{ name: 'Kore', value: 'Kore' },
			{ name: 'Puck', value: 'Puck' },
		]);
		const none = await loadOptions.getVoices.call(catalogContext({ model: '' }));
		assert.deepEqual(none, [{ name: 'Model Default', value: '' }]);
	});

	it('lists catalog categories', async () => {
		const categories = await loadOptions.getModelCategories.call(catalogContext());
		assert.deepEqual(categories, [
			{ name: 'Text Generation', value: 'text' },
			{ name: 'Image Generation', value: 'image' },
			{ name: 'Video Generation', value: 'video' },
		]);
	});
});

describe('model lists of the operations added in 0.4.0', () => {
	const catalog = {
		object: 'list',
		data: [
			{
				id: 'vision-chat',
				display_name: 'Vision Chat',
				category: 'text',
				status: 'available',
				input_modalities: ['text', 'image'],
				output_modalities: ['text'],
				supported_endpoints: ['POST /v1/chat/completions'],
			},
			{
				id: 'older-vision',
				display_name: 'Older Vision',
				category: 'text',
				status: 'available',
				input_modalities: ['text', 'image'],
				supported_endpoints: ['POST /v1/chat/completions'],
			},
			{
				id: 'text-chat',
				display_name: 'Text Chat',
				category: 'text',
				status: 'available',
				input_modalities: ['text'],
				supported_endpoints: ['POST /v1/chat/completions'],
			},
			{
				id: 'retired-vision',
				category: 'text',
				status: 'unavailable',
				input_modalities: ['text', 'image'],
				supported_endpoints: ['POST /v1/chat/completions'],
			},
			{
				id: 'edit-image',
				category: 'image',
				input_modalities: ['text', 'image'],
				supported_endpoints: ['POST /v1/images/generations', 'POST /v1/images/edits'],
			},
			{
				id: 'plain-image',
				category: 'image',
				input_modalities: ['text'],
				supported_endpoints: ['POST /v1/images/generations'],
			},
			{ id: 'tune-maker', category: 'audio', supported_endpoints: ['POST /v1/audio/generations'] },
			{
				id: 'speech-model',
				category: 'audio',
				supported_endpoints: ['POST /v1/audio/speech', 'GET /v1/voices'],
			},
			{ id: 'plain-speech', category: 'audio', supported_endpoints: ['POST /v1/audio/speech'] },
			{ id: 'old-audio', category: 'audio' },
			{ id: 'mesh-maker', category: '3d', supported_endpoints: ['POST /v1/3d/generations'] },
			{ id: 'old-mesh', category: '3d' },
			{
				id: 'decision-model',
				category: 'decision',
				input_modalities: ['text', 'image'],
				output_modalities: ['decision'],
				supported_endpoints: ['POST /v1/decisions', 'POST /v1/chat/completions'],
			},
			{
				id: 'detect-model',
				category: 'tools',
				supported_endpoints: ['POST /v1/detect', 'POST /v1/chat/completions'],
			},
			{ id: 'agent-tool', category: 'tools', supported_endpoints: ['POST /v1/agents/run'] },
			{ id: 'old-tool', category: 'tools' },
			{ id: 'rerank-model', category: 'reranker', supported_endpoints: ['POST /v1/reranks'] },
			{ id: 'old-rerank', category: 'reranker' },
			{
				id: 'answer-model',
				category: 'research',
				supported_endpoints: ['POST /v1/answer', 'POST /v1/search'],
			},
			{
				id: 'research-model',
				category: 'research',
				supported_endpoints: ['POST /v1/research', 'POST /v1/search'],
			},
			{ id: 'search-model', category: 'research', supported_endpoints: ['POST /v1/search'] },
		],
	};

	async function list(method) {
		const context = createLoadOptionsContext({ respond: () => catalog });
		const options = await loadOptions[method].call(context);
		assert.equal(context.calls.length, 1);
		assert.equal(context.calls[0].method, 'GET');
		assert.equal(context.calls[0].url, '/models');
		return options.map((option) => option.value);
	}

	it('lists each model list by the endpoint its operation calls', async () => {
		assert.deepEqual(await list('getImageEditModels'), ['edit-image']);
		assert.deepEqual(await list('getAudioGenerationModels'), ['tune-maker']);
		assert.deepEqual(await list('getDetectionModels'), ['detect-model']);
		assert.deepEqual(await list('getAnswerModels'), ['answer-model']);
		assert.deepEqual(await list('getResearchModels'), ['research-model']);
		assert.deepEqual(await list('getSearchModels'), [
			'answer-model',
			'research-model',
			'search-model',
		]);
	});

	it('falls back to the category only where the category names the operation', async () => {
		assert.deepEqual(await list('getThreeDModels'), ['mesh-maker', 'old-mesh']);
		assert.deepEqual(await list('getRerankModels'), ['old-rerank', 'rerank-model']);
		assert.deepEqual(await list('getDecisionModels'), ['decision-model']);
	});

	it('lists the models with a voice list by the GET endpoint', async () => {
		assert.deepEqual(await list('getVoiceModels'), ['speech-model']);
		assert.equal(
			loadOptions.modelSupports({ supported_endpoints: ['get /v1/voices '] }, 'voice'),
			true,
		);
		assert.equal(
			loadOptions.modelSupports({ supported_endpoints: ['POST /v1/voices'] }, 'voice'),
			false,
		);
	});

	it('lists the chat models that read images and answer in text for image analysis', async () => {
		// A model that reads images but does not answer in text, such as a decision model, is left out.
		assert.deepEqual(await list('getVisionModels'), ['older-vision', 'vision-chat']);
		assert.equal(loadOptions.modelReadsImages({ input_modalities: ['Text', ' IMAGE '] }), true);
		assert.equal(loadOptions.modelReadsImages({ input_modalities: ['text'] }), false);
		assert.equal(loadOptions.modelReadsImages({}), false);
		assert.equal(
			loadOptions.modelAnswersAboutImages({
				input_modalities: ['image'],
				output_modalities: ['Text', 'audio'],
			}),
			true,
		);
		assert.equal(
			loadOptions.modelAnswersAboutImages({
				input_modalities: ['image'],
				output_modalities: ['image'],
			}),
			false,
		);
	});
});

describe('job picker', () => {
	const listSearch = loadDist('nodes/Empiriolabs/methods/listSearch.js');

	it('lists recent jobs with a readable name and filters them', async () => {
		const context = createLoadOptionsContext({
			respond: () => ({
				data: [
					{
						job_id: 'job_a',
						model: 'reel-video',
						status: 'succeeded',
						created_at: '2026-10-16T10:00:00.123Z',
					},
					{
						job_id: 'job_b',
						model: 'pixel-image',
						status: 'processing',
						// The API can also return Unix seconds.
						created_at: 1792144740.25,
					},
				],
			}),
		});
		const all = await listSearch.searchJobs.call(context);
		assert.deepEqual(all.results, [
			{ name: 'reel-video, completed, 2026-10-16 10:00:00 UTC (job_a)', value: 'job_a' },
			{ name: 'pixel-image, processing, 2026-10-16 09:59:00 UTC (job_b)', value: 'job_b' },
		]);
		assert.deepEqual(context.calls[0].qs, { limit: 100 });

		const filtered = await listSearch.searchJobs.call(context, 'PIXEL');
		assert.deepEqual(
			filtered.results.map((result) => result.value),
			['job_b'],
		);
	});
});

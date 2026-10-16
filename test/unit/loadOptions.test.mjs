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

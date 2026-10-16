import type { IDataObject, ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';

import { apiRequest, isDataObject } from '../transport';

/**
 * Each operation lists the catalog models whose entry advertises the endpoint it calls.
 * The category is a fallback for entries that do not list their endpoints.
 */
const MODEL_FILTERS: Record<string, { endpoint: string; categories: string[] }> = {
	chat: { endpoint: '/v1/chat/completions', categories: ['text'] },
	image: { endpoint: '/v1/images/generations', categories: ['image'] },
	speech: { endpoint: '/v1/audio/speech', categories: [] },
	transcription: { endpoint: '/v1/audio/transcriptions', categories: ['transcription'] },
	video: { endpoint: '/v1/videos/generations', categories: ['video'] },
	embedding: { endpoint: '/v1/embeddings', categories: ['embedding'] },
};

async function fetchCatalog(this: ILoadOptionsFunctions): Promise<IDataObject> {
	return await apiRequest.call(this, 'GET', '/models');
}

function catalogModels(catalog: IDataObject): IDataObject[] {
	return Array.isArray(catalog.data) ? (catalog.data as unknown[]).filter(isDataObject) : [];
}

export function modelSupports(model: IDataObject, filterKey: string): boolean {
	const filter = MODEL_FILTERS[filterKey];
	if (!filter) {
		return false;
	}
	const endpoints = model.supported_endpoints;
	if (Array.isArray(endpoints) && endpoints.length > 0) {
		return endpoints.some(
			(entry) =>
				typeof entry === 'string' &&
				entry.trim().toUpperCase() === `POST ${filter.endpoint}`.toUpperCase(),
		);
	}
	return filter.categories.includes(String(model.category ?? ''));
}

export function toModelOption(model: IDataObject): INodePropertyOptions {
	const id = String(model.id);
	const name =
		typeof model.display_name === 'string' && model.display_name ? model.display_name : id;
	const parts: string[] = [`ID: ${id}.`];
	if (typeof model.description === 'string' && model.description) {
		parts.push(model.description);
	}
	if (model.deprecated === true && typeof model.deprecation_date === 'string') {
		parts.push(`Retires on ${model.deprecation_date}.`);
	}
	return { name, value: id, description: parts.join(' ') };
}

export function buildModelOptions(catalog: IDataObject, filterKey: string): INodePropertyOptions[] {
	return catalogModels(catalog)
		.filter((model) => typeof model.id === 'string' && model.id !== '')
		.filter((model) => model.status === undefined || model.status === 'available')
		.filter((model) => modelSupports(model, filterKey))
		.map(toModelOption)
		.sort((a, b) => a.name.localeCompare(b.name));
}

async function modelsFor(
	this: ILoadOptionsFunctions,
	filterKey: string,
): Promise<INodePropertyOptions[]> {
	const catalog = await fetchCatalog.call(this);
	return buildModelOptions(catalog, filterKey);
}

export async function getChatModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	return await modelsFor.call(this, 'chat');
}

export async function getImageModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	return await modelsFor.call(this, 'image');
}

export async function getSpeechModels(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return await modelsFor.call(this, 'speech');
}

export async function getTranscriptionModels(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return await modelsFor.call(this, 'transcription');
}

export async function getVideoModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	return await modelsFor.call(this, 'video');
}

export async function getEmbeddingModels(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return await modelsFor.call(this, 'embedding');
}

/**
 * Lists the voices the selected text to speech model declares in its catalog parameters.
 */
export async function getVoices(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const modelId = this.getCurrentNodeParameter('model');
	const options: INodePropertyOptions[] = [{ name: 'Model Default', value: '' }];
	if (typeof modelId !== 'string' || modelId === '' || modelId.startsWith('=')) {
		return options;
	}

	const model = await apiRequest.call(this, 'GET', `/models/${encodeURIComponent(modelId)}`);
	const parameters = [model.supported_parameters, model.parameters].find((entry) =>
		Array.isArray(entry),
	) as unknown[] | undefined;
	const voice = (parameters ?? [])
		.filter(isDataObject)
		.find((parameter) => parameter.name === 'voice');
	const values = voice ? (voice.options ?? voice.allowed_values) : undefined;
	if (!Array.isArray(values)) {
		return options;
	}

	const seen = new Set<string>();
	for (const value of values) {
		const voiceId = isDataObject(value) ? String(value.id ?? value.value ?? '') : String(value);
		if (voiceId && !seen.has(voiceId)) {
			seen.add(voiceId);
			options.push({ name: voiceId, value: voiceId });
		}
	}
	return options;
}

/**
 * Lists the catalog categories, such as text, image, or video, for filtering models.
 */
export async function getModelCategories(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const catalog = await fetchCatalog.call(this);
	const categories = Array.isArray(catalog.categories)
		? (catalog.categories as unknown[]).filter(isDataObject)
		: [];
	if (categories.length > 0) {
		return categories
			.filter((category) => typeof category.slug === 'string' && category.slug !== '')
			.map((category) => ({
				name:
					typeof category.name === 'string' && category.name
						? category.name
						: String(category.slug),
				value: String(category.slug),
			}));
	}

	const slugs = new Set<string>();
	for (const model of catalogModels(catalog)) {
		if (typeof model.category === 'string' && model.category) {
			slugs.add(model.category);
		}
	}
	return [...slugs].sort().map((slug) => ({ name: slug, value: slug }));
}

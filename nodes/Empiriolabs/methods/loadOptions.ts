import type { IDataObject, ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';

import { apiRequest, isDataObject, listEntries } from '../transport';

/**
 * Each operation lists the catalog models whose entry advertises the endpoint it calls.
 * The category is a fallback for entries that do not list their endpoints.
 */
const MODEL_FILTERS: Record<string, { endpoint: string; method?: string; categories: string[] }> = {
	chat: { endpoint: '/v1/chat/completions', categories: ['text'] },
	image: { endpoint: '/v1/images/generations', categories: ['image'] },
	imageEdit: { endpoint: '/v1/images/edits', categories: [] },
	speech: { endpoint: '/v1/audio/speech', categories: [] },
	audioGeneration: { endpoint: '/v1/audio/generations', categories: [] },
	voice: { endpoint: '/v1/voices', method: 'GET', categories: [] },
	transcription: { endpoint: '/v1/audio/transcriptions', categories: ['transcription'] },
	video: { endpoint: '/v1/videos/generations', categories: ['video'] },
	threeD: { endpoint: '/v1/3d/generations', categories: ['3d'] },
	embedding: { endpoint: '/v1/embeddings', categories: ['embedding'] },
	rerank: { endpoint: '/v1/reranks', categories: ['reranker'] },
	decision: { endpoint: '/v1/decisions', categories: ['decision'] },
	detection: { endpoint: '/v1/detect', categories: [] },
	document: { endpoint: '/v1/ocr', categories: ['ocr'] },
	search: { endpoint: '/v1/search', categories: [] },
	answer: { endpoint: '/v1/answer', categories: [] },
	research: { endpoint: '/v1/research', categories: [] },
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
	const route = `${filter.method ?? 'POST'} ${filter.endpoint}`.toUpperCase();
	const endpoints = model.supported_endpoints;
	if (Array.isArray(endpoints) && endpoints.length > 0) {
		return endpoints.some(
			(entry) => typeof entry === 'string' && entry.trim().toUpperCase() === route,
		);
	}
	return filter.categories.includes(String(model.category ?? ''));
}

function listsModality(list: unknown, modality: string): boolean {
	return (
		Array.isArray(list) &&
		list.some((entry) => typeof entry === 'string' && entry.trim().toLowerCase() === modality)
	);
}

/** Whether a model's catalog entry lists image among the inputs it reads. */
export function modelReadsImages(model: IDataObject): boolean {
	return listsModality(model.input_modalities, 'image');
}

/**
 * Whether a model can answer a question about an image as text: it reads images, and its
 * outputs, when the catalog lists them, include text.
 */
export function modelAnswersAboutImages(model: IDataObject): boolean {
	const outputs = model.output_modalities;
	const writesText =
		!Array.isArray(outputs) || outputs.length === 0 || listsModality(outputs, 'text');
	return modelReadsImages(model) && writesText;
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

export function buildModelOptions(
	catalog: IDataObject,
	filterKey: string,
	accepts: (model: IDataObject) => boolean = () => true,
): INodePropertyOptions[] {
	return catalogModels(catalog)
		.filter((model) => typeof model.id === 'string' && model.id !== '')
		.filter((model) => model.status === undefined || model.status === 'available')
		.filter((model) => modelSupports(model, filterKey))
		.filter(accepts)
		.map(toModelOption)
		.sort((a, b) => a.name.localeCompare(b.name));
}

async function modelsFor(
	this: ILoadOptionsFunctions,
	filterKey: string,
	accepts?: (model: IDataObject) => boolean,
): Promise<INodePropertyOptions[]> {
	const catalog = await fetchCatalog.call(this);
	return buildModelOptions(catalog, filterKey, accepts);
}

export async function getChatModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	return await modelsFor.call(this, 'chat');
}

export async function getImageModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	return await modelsFor.call(this, 'image');
}

export async function getImageEditModels(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return await modelsFor.call(this, 'imageEdit');
}

/**
 * Lists the models that can answer a question about an image: the chat models whose catalog
 * entry lists image input and, among its outputs, text.
 */
export async function getVisionModels(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return await modelsFor.call(this, 'chat', modelAnswersAboutImages);
}

export async function getSpeechModels(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return await modelsFor.call(this, 'speech');
}

export async function getAudioGenerationModels(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return await modelsFor.call(this, 'audioGeneration');
}

/** Lists the text to speech models that have a voice list. */
export async function getVoiceModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	return await modelsFor.call(this, 'voice');
}

export async function getTranscriptionModels(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return await modelsFor.call(this, 'transcription');
}

export async function getVideoModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	return await modelsFor.call(this, 'video');
}

export async function getThreeDModels(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return await modelsFor.call(this, 'threeD');
}

export async function getDocumentModels(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return await modelsFor.call(this, 'document');
}

export async function getSearchModels(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return await modelsFor.call(this, 'search');
}

export async function getAnswerModels(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return await modelsFor.call(this, 'answer');
}

export async function getResearchModels(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return await modelsFor.call(this, 'research');
}

export async function getEmbeddingModels(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return await modelsFor.call(this, 'embedding');
}

export async function getRerankModels(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return await modelsFor.call(this, 'rerank');
}

export async function getDecisionModels(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return await modelsFor.call(this, 'decision');
}

export async function getDetectionModels(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return await modelsFor.call(this, 'detection');
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

export function toTemplateOption(template: IDataObject): INodePropertyOptions {
	const slug = String(template.slug);
	const name =
		typeof template.display_name === 'string' && template.display_name
			? template.display_name
			: slug;
	const parts: string[] = [`ID: ${slug}.`];
	if (typeof template.description === 'string' && template.description) {
		parts.push(template.description);
	}
	return { name, value: slug, description: parts.join(' ') };
}

export function buildTemplateOptions(response: IDataObject): INodePropertyOptions[] {
	return listEntries(response)
		.filter((template) => typeof template.slug === 'string' && template.slug !== '')
		.map(toTemplateOption)
		.sort((a, b) => a.name.localeCompare(b.name));
}

/** Lists the image generation templates. */
export async function getImageTemplates(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return buildTemplateOptions(await apiRequest.call(this, 'GET', '/images/templates'));
}

/** Lists the video generation templates. */
export async function getVideoTemplates(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return buildTemplateOptions(await apiRequest.call(this, 'GET', '/videos/templates'));
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

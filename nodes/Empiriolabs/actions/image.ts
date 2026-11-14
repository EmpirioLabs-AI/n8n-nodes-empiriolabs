import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	apiRequest,
	binaryFieldName,
	extractMediaReferences,
	fileExtension,
	imageDataUri,
	isDataObject,
	isJobEnvelope,
	limitEntries,
	listEntries,
	parseJsonObjectParameter,
	resolveMediaReference,
	templateListQuery,
	waitForJob,
} from '../transport';

export function splitList(value: unknown): string[] {
	if (typeof value !== 'string') {
		return [];
	}
	return value
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry !== '');
}

export function buildImageBody(this: IExecuteFunctions, itemIndex: number): IDataObject {
	const model = this.getNodeParameter('model', itemIndex) as string;
	const prompt = this.getNodeParameter('prompt', itemIndex) as string;
	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;

	const optional: IDataObject = {};
	if (typeof options.aspectRatio === 'string' && options.aspectRatio !== '') {
		optional.aspect_ratio = options.aspectRatio;
	}
	if (typeof options.resolution === 'string' && options.resolution !== '') {
		optional.resolution = options.resolution;
	}
	if (typeof options.numberOfImages === 'number') {
		optional.num_images = options.numberOfImages;
	}
	const referenceImages = splitList(options.referenceImageUrls);
	if (referenceImages.length > 0) {
		optional.image = referenceImages;
	}
	const extra = parseJsonObjectParameter.call(
		this,
		options.modelParameters,
		'Model Parameters (JSON)',
		itemIndex,
	);

	// sync asks the API to hold the request and answer with the finished images.
	return { ...optional, ...extra, model, prompt, sync: true };
}

/**
 * Waits for the job when the API answers with one, then downloads every image of the result.
 * Each image is its own item, with the binary file and its model, prompt, index and URL.
 */
async function imageItems(
	this: IExecuteFunctions,
	response: IDataObject,
	body: IDataObject,
	options: IDataObject,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	let result = response;
	if (isJobEnvelope(result)) {
		const timeout = typeof options.timeout === 'number' ? options.timeout : 300;
		const job = await waitForJob.call(this, String(result.job_id), timeout, itemIndex, 5);
		result = isDataObject(job.result) ? job.result : job;
	}

	const references = extractMediaReferences(result);
	if (references.length === 0) {
		throw new NodeOperationError(this.getNode(), 'The response did not include any images', {
			itemIndex,
			description: 'Try again, or try a different prompt or model',
		});
	}

	const field = binaryFieldName(options);
	const items: INodeExecutionData[] = [];
	for (let index = 0; index < references.length; index++) {
		const reference = references[index];
		const file = await resolveMediaReference.call(this, reference, itemIndex);
		const mimeType = file.mimeType || 'image/png';
		const fileName = `image-${index + 1}.${fileExtension(file, mimeType, 'png')}`;
		const binary = await this.helpers.prepareBinaryData(file.data, fileName, mimeType);
		items.push({
			json: {
				model: result.model ?? body.model,
				prompt: body.prompt,
				index,
				url: reference.url ?? null,
			},
			binary: { [field]: binary },
			pairedItem: { item: itemIndex },
		});
	}
	return items;
}

export async function generateImage(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;
	const body = buildImageBody.call(this, itemIndex);
	const response = await apiRequest.call(this, 'POST', '/images/generations', body);
	return await imageItems.call(this, response, body, options, itemIndex);
}

export function buildImageEditBody(
	this: IExecuteFunctions,
	itemIndex: number,
	wait: boolean,
): IDataObject {
	const model = this.getNodeParameter('model', itemIndex) as string;
	const prompt = this.getNodeParameter('prompt', itemIndex) as string;
	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;

	const urls = splitList(this.getNodeParameter('imageUrls', itemIndex));
	if (urls.length === 0) {
		throw new NodeOperationError(this.getNode(), 'Enter the URL of the image to edit', {
			itemIndex,
			description: 'Image URLs takes one HTTPS URL, or several separated by commas',
		});
	}
	const extra = parseJsonObjectParameter.call(
		this,
		options.modelParameters,
		'Model Parameters (JSON)',
		itemIndex,
	);

	// sync true holds the request for the edited images; sync false answers with the job at once.
	return { ...extra, model, prompt, image: urls.length === 1 ? urls[0] : urls, sync: wait };
}

/**
 * Edits an image with a text instruction. The output is the same as for Generate: each edited
 * image as its own item with a binary file. With Wait for Completion off, the output is the job.
 */
export async function editImage(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;
	const wait = this.getNodeParameter('waitForCompletion', itemIndex, true) as boolean;
	const body = buildImageEditBody.call(this, itemIndex, wait);
	const response = await apiRequest.call(this, 'POST', '/images/edits', body);
	if (!wait) {
		return [{ json: response, pairedItem: { item: itemIndex } }];
	}
	return await imageItems.call(this, response, body, options, itemIndex);
}

export async function buildImageAnalysisBody(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const model = this.getNodeParameter('model', itemIndex) as string;
	const question = this.getNodeParameter('question', itemIndex) as string;
	const inputSource = this.getNodeParameter('inputSource', itemIndex, 'binaryData') as string;
	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;

	let image: string;
	if (inputSource === 'url') {
		image = (this.getNodeParameter('imageUrl', itemIndex) as string).trim();
	} else {
		const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex) as string;
		image = await imageDataUri.call(this, itemIndex, binaryPropertyName);
	}

	const optional: IDataObject = {};
	if (typeof options.temperature === 'number') {
		optional.analysis_temperature = options.temperature;
	}
	if (typeof options.topP === 'number') {
		optional.analysis_top_p = options.topP;
	}
	if (typeof options.seed === 'number') {
		optional.analysis_seed = options.seed;
	}
	return { ...optional, model, image_url: image, question };
}

/**
 * Asks a question about one image. The output is the API's answer: `analysis`, the answer as
 * text, with the model and the usage.
 */
export async function analyzeImage(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const body = await buildImageAnalysisBody.call(this, itemIndex);
	const response = await apiRequest.call(this, 'POST', '/images/analysis', body);
	return [{ json: response, pairedItem: { item: itemIndex } }];
}

export async function getManyImageTemplates(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const filters = this.getNodeParameter('filters', itemIndex, {}) as IDataObject;
	const response = await apiRequest.call(
		this,
		'GET',
		'/images/templates',
		undefined,
		templateListQuery(filters),
	);
	return limitEntries
		.call(this, listEntries(response), itemIndex)
		.map((template) => ({ json: template, pairedItem: { item: itemIndex } }));
}

export async function getImageTemplate(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const slug = String(this.getNodeParameter('template', itemIndex) ?? '').trim();
	if (slug === '') {
		throw new NodeOperationError(this.getNode(), 'Select a template or enter a template ID', {
			itemIndex,
			description: 'Template IDs are returned by the Get Many Templates operation',
		});
	}
	const template = await apiRequest.call(
		this,
		'GET',
		`/images/templates/${encodeURIComponent(slug)}`,
	);
	return [{ json: template, pairedItem: { item: itemIndex } }];
}

import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	apiRequest,
	binaryFieldName,
	extractMediaReferences,
	fileExtension,
	isDataObject,
	isJobEnvelope,
	parseJsonObjectParameter,
	resolveMediaReference,
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

export async function generateImage(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;
	const body = buildImageBody.call(this, itemIndex);

	let result = await apiRequest.call(this, 'POST', '/images/generations', body);
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

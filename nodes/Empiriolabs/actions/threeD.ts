import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';

import {
	apiRequest,
	binaryFieldName,
	imageDataUri,
	parseJsonObjectParameter,
	startedJobItems,
} from '../transport';

export async function buildThreeDBody(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const model = this.getNodeParameter('model', itemIndex) as string;
	const imageSource = this.getNodeParameter('imageSource', itemIndex, 'binaryData') as string;
	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;

	const optional: IDataObject = {};
	if (typeof options.resolution === 'string' && options.resolution.trim() !== '') {
		optional.resolution = options.resolution.trim();
	}
	if (typeof options.seed === 'number') {
		optional.seed = options.seed;
	}
	if (typeof options.textureSize === 'string' && options.textureSize.trim() !== '') {
		optional.texture_size = options.textureSize.trim();
	}
	if (typeof options.decimationTarget === 'number') {
		optional.decimation_target = options.decimationTarget;
	}
	if (typeof options.remesh === 'boolean') {
		optional.remesh = options.remesh;
	}
	if (typeof options.maxNumTokens === 'number') {
		optional.max_num_tokens = options.maxNumTokens;
	}
	const extra = parseJsonObjectParameter.call(
		this,
		options.modelParameters,
		'Model Parameters (JSON)',
		itemIndex,
	);

	const body: IDataObject = { ...optional, ...extra, model };
	// The image is a public URL or, from a binary field, a base64 data URI.
	if (imageSource === 'url') {
		body.image = (this.getNodeParameter('imageUrl', itemIndex) as string).trim();
	} else if (imageSource !== 'none') {
		const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex) as string;
		body.image = await imageDataUri.call(this, itemIndex, binaryPropertyName);
	}
	return body;
}

/**
 * Starts a 3D generation job. The output is the job, or with Wait for Completion on, the
 * finished job with each 3D file downloaded as a binary file.
 */
export async function generateThreeD(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;
	const body = await buildThreeDBody.call(this, itemIndex);
	const started = await apiRequest.call(this, 'POST', '/3d/generations', body);

	return await startedJobItems.call(this, started, itemIndex, {
		wait: this.getNodeParameter('waitForCompletion', itemIndex, false) as boolean,
		timeoutSeconds: this.getNodeParameter('timeout', itemIndex, 900) as number,
		pollSeconds: 10,
		download: this.getNodeParameter('downloadFile', itemIndex, true) as boolean,
		field: binaryFieldName(options),
		naming: { baseName: 'model', mimeType: 'model/gltf-binary', extension: 'glb' },
		downloadToggle: 'Download File',
	});
}

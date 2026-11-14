import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';

import { apiRequest, parseJsonObjectParameter } from '../transport';

export function buildDetectionBody(this: IExecuteFunctions, itemIndex: number): IDataObject {
	const model = this.getNodeParameter('model', itemIndex) as string;
	const text = this.getNodeParameter('text', itemIndex) as string;
	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;

	const optional: IDataObject = {};
	if (typeof options.version === 'string' && options.version.trim() !== '') {
		optional.version = options.version.trim();
	}
	const extra = parseJsonObjectParameter.call(
		this,
		options.modelParameters,
		'Model Parameters (JSON)',
		itemIndex,
	);
	return { ...optional, ...extra, model, input: text };
}

/**
 * Checks a text with a detection model. The output is the API's result as it returns it, with
 * the overall scores and the breakdown by sentence.
 */
export async function detectText(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const body = buildDetectionBody.call(this, itemIndex);
	const response = await apiRequest.call(this, 'POST', '/detect', body);
	return [{ json: response, pairedItem: { item: itemIndex } }];
}

import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';

import {
	apiRequest,
	isDataObject,
	isJobEnvelope,
	parseJsonObjectParameter,
	waitForJob,
} from '../transport';

export function buildSearchBody(this: IExecuteFunctions, itemIndex: number): IDataObject {
	const model = this.getNodeParameter('model', itemIndex) as string;
	const query = (this.getNodeParameter('query', itemIndex) as string).trim();
	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;
	const extra = parseJsonObjectParameter.call(
		this,
		options.modelParameters,
		'Model Parameters (JSON)',
		itemIndex,
	);
	return { ...extra, model, query };
}

/**
 * Searches the web with a search model. The output is the model's answer as the API returns it:
 * results with titles, URLs and snippets, an answer, or both, depending on the model.
 */
export async function searchWeb(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;
	const response = await apiRequest.call(this, 'POST', '/search', buildSearchBody.call(this, itemIndex));

	if (!isJobEnvelope(response)) {
		return [{ json: response, pairedItem: { item: itemIndex } }];
	}
	const wait = this.getNodeParameter('waitForCompletion', itemIndex, true) as boolean;
	if (!wait) {
		return [{ json: response, pairedItem: { item: itemIndex } }];
	}
	const timeout = typeof options.timeout === 'number' ? options.timeout : 600;
	const job = await waitForJob.call(this, String(response.job_id), timeout, itemIndex, 5);
	const result = isDataObject(job.result) ? job.result : {};
	return [{ json: { ...result, job_id: job.job_id }, pairedItem: { item: itemIndex } }];
}

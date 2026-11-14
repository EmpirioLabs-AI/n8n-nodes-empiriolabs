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

export function buildAnswerBody(this: IExecuteFunctions, itemIndex: number): IDataObject {
	const model = this.getNodeParameter('model', itemIndex) as string;
	const query = (this.getNodeParameter('query', itemIndex) as string).trim();
	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;

	const optional: IDataObject = {};
	if (typeof options.includeText === 'boolean') {
		optional.text = options.includeText;
	}
	if (typeof options.disableFormatting === 'boolean') {
		optional.disable_formatting = options.disableFormatting;
	}
	const extra = parseJsonObjectParameter.call(
		this,
		options.modelParameters,
		'Model Parameters (JSON)',
		itemIndex,
	);
	return { ...optional, ...extra, model, query };
}

/**
 * Answers a question from the web with an answer model. The output is the API's response: the
 * answer and the sources it cites.
 */
export async function answerWeb(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const body = buildAnswerBody.call(this, itemIndex);
	const response = await apiRequest.call(this, 'POST', '/answer', body);
	return [{ json: response, pairedItem: { item: itemIndex } }];
}

export function buildResearchBody(this: IExecuteFunctions, itemIndex: number): IDataObject {
	const model = this.getNodeParameter('model', itemIndex) as string;
	const query = (this.getNodeParameter('query', itemIndex) as string).trim();
	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;

	const optional: IDataObject = {};
	if (typeof options.researchDepth === 'string' && options.researchDepth !== '') {
		optional.tavily_model = options.researchDepth;
	}
	if (typeof options.citationFormat === 'string' && options.citationFormat !== '') {
		optional.citation_format = options.citationFormat;
	}
	if (typeof options.disableFormatting === 'boolean') {
		optional.disable_formatting = options.disableFormatting;
	}
	const extra = parseJsonObjectParameter.call(
		this,
		options.modelParameters,
		'Model Parameters (JSON)',
		itemIndex,
	);
	// The report comes back as one response, never as a stream of events.
	return { ...optional, ...extra, model, query, stream: false };
}

/**
 * Researches a question with a research model. The request stays open until the report is
 * written, which can take several minutes. The output is the API's response: the report in
 * `answer` and the sources it cites.
 */
export async function researchWeb(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;
	const body = buildResearchBody.call(this, itemIndex);
	const timeout = typeof options.timeout === 'number' ? options.timeout : 900;
	// Stopping the execution ends the open request.
	const cancelSignal =
		typeof this.getExecutionCancelSignal === 'function'
			? this.getExecutionCancelSignal()
			: undefined;
	const response = await apiRequest.call(this, 'POST', '/research', body, undefined, {
		timeout: Math.max(timeout, 1) * 1000,
		...(cancelSignal ? { abortSignal: cancelSignal } : {}),
	});
	return [{ json: response, pairedItem: { item: itemIndex } }];
}

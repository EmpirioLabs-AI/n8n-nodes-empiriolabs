import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	apiRequest,
	isDataObject,
	parseJsonObjectParameter,
	readJsonParameter,
} from '../transport';

export function readRerankDocuments(this: IExecuteFunctions, itemIndex: number): string[] {
	const mode = this.getNodeParameter('documentsMode', itemIndex, 'fields') as string;

	let documents: string[];
	if (mode === 'json') {
		const value = readJsonParameter(this.getNodeParameter('documentsJson', itemIndex, ''));
		if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
			throw new NodeOperationError(
				this.getNode(),
				'Documents (JSON) must be a JSON array of texts',
				{
					itemIndex,
					description: 'Enter an array such as ["First text", "Second text"]',
				},
			);
		}
		documents = value as string[];
	} else {
		const entries = this.getNodeParameter('documents.values', itemIndex, []) as IDataObject[];
		documents = (Array.isArray(entries) ? entries : [])
			.map((entry) => (typeof entry.text === 'string' ? entry.text : ''))
			.filter((text) => text.trim() !== '');
	}

	if (documents.length === 0) {
		throw new NodeOperationError(this.getNode(), 'Add at least one document', {
			itemIndex,
			description: 'Use Add Document in the Documents parameter, or enter a JSON array of texts',
		});
	}
	return documents;
}

export function buildRerankBody(
	this: IExecuteFunctions,
	itemIndex: number,
	documents: string[],
): IDataObject {
	const model = this.getNodeParameter('model', itemIndex) as string;
	const query = this.getNodeParameter('query', itemIndex) as string;
	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;

	const optional: IDataObject = {};
	if (typeof options.topN === 'number') {
		optional.top_n = options.topN;
	}
	if (typeof options.instruct === 'string' && options.instruct.trim() !== '') {
		optional.instruct = options.instruct.trim();
	}
	if (typeof options.returnDocuments === 'boolean') {
		optional.return_documents = options.returnDocuments;
	}
	const extra = parseJsonObjectParameter.call(
		this,
		options.modelParameters,
		'Model Parameters (JSON)',
		itemIndex,
	);
	return { ...optional, ...extra, model, query, documents };
}

/**
 * One entry per ranked document, most relevant first: its position in the input, its score and
 * its text. The text comes from the response when it has it, otherwise from the input.
 */
export function simplifyRerankResults(response: IDataObject, documents: string[]): IDataObject[] {
	const results = Array.isArray(response.results)
		? (response.results as unknown[]).filter(isDataObject)
		: [];
	return results.map((result) => {
		const returned = isDataObject(result.document) ? result.document.text : undefined;
		const fromInput = typeof result.index === 'number' ? documents[result.index] : undefined;
		return {
			index: result.index,
			relevance_score: result.relevance_score,
			text: typeof returned === 'string' ? returned : fromInput,
		};
	});
}

/**
 * Sorts documents by relevance to a query with a reranking model. Simplified, each ranked
 * document is its own item; otherwise the output is the API's response.
 */
export async function rerankDocuments(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const documents = readRerankDocuments.call(this, itemIndex);
	const body = buildRerankBody.call(this, itemIndex, documents);
	const response = await apiRequest.call(this, 'POST', '/reranks', body);

	const simplify = this.getNodeParameter('simplify', itemIndex, true) as boolean;
	if (!simplify) {
		return [{ json: response, pairedItem: { item: itemIndex } }];
	}
	return simplifyRerankResults(response, documents).map((result) => ({
		json: result,
		pairedItem: { item: itemIndex },
	}));
}

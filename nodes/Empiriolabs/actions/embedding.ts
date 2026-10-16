import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { apiRequest, isDataObject, parseJsonObjectParameter } from '../transport';

export async function createEmbedding(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const model = this.getNodeParameter('model', itemIndex) as string;
	const text = this.getNodeParameter('text', itemIndex) as string;
	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;
	const extra = parseJsonObjectParameter.call(
		this,
		options.modelParameters,
		'Model Parameters (JSON)',
		itemIndex,
	);

	const response = await apiRequest.call(this, 'POST', '/embeddings', {
		...extra,
		model,
		input: text,
	});

	const simplify = this.getNodeParameter('simplify', itemIndex, true) as boolean;
	if (!simplify) {
		return [{ json: response, pairedItem: { item: itemIndex } }];
	}

	const data = Array.isArray(response.data) ? response.data : [];
	const first = isDataObject(data[0]) ? data[0] : {};
	const embedding = first.embedding;
	if (embedding === undefined) {
		throw new NodeOperationError(this.getNode(), 'The response did not include an embedding', {
			itemIndex,
			description: 'Turn off Simplify to see the full response',
		});
	}

	return [
		{
			json: {
				embedding,
				dimensions: Array.isArray(embedding) ? embedding.length : undefined,
				model: response.model ?? model,
				usage: response.usage,
			},
			pairedItem: { item: itemIndex },
		},
	];
}

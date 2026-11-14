import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { apiRequest, limitEntries, listEntries, locatorValue } from '../transport';

const TEXT_FILTERS = ['type', 'language', 'gender', 'tier', 'pitch'];

export function buildVoiceQuery(model: string, filters: IDataObject): IDataObject {
	const qs: IDataObject = { model };
	for (const name of TEXT_FILTERS) {
		const value = filters[name];
		if (typeof value === 'string' && value.trim() !== '') {
			qs[name] = value.trim();
		}
	}
	if (typeof filters.search === 'string' && filters.search.trim() !== '') {
		qs.q = filters.search.trim();
	}
	if (typeof filters.multilingual === 'boolean') {
		qs.multilingual = filters.multilingual;
	}
	return qs;
}

/**
 * Lists the voices of a text to speech model, with the custom voices of the account. Each
 * voice is its own item, as the API returns it.
 */
export async function getManyVoices(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const model = this.getNodeParameter('model', itemIndex) as string;
	const filters = this.getNodeParameter('filters', itemIndex, {}) as IDataObject;

	const response = await apiRequest.call(
		this,
		'GET',
		'/voices',
		undefined,
		buildVoiceQuery(model, filters),
	);
	return limitEntries
		.call(this, listEntries(response), itemIndex)
		.map((voice) => ({ json: voice, pairedItem: { item: itemIndex } }));
}

export async function deleteVoice(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const model = this.getNodeParameter('model', itemIndex) as string;
	const voiceId = locatorValue(
		this.getNodeParameter('voiceId', itemIndex, '', { extractValue: true }),
	);
	if (voiceId === '') {
		throw new NodeOperationError(this.getNode(), 'Select a voice or enter a voice ID', {
			itemIndex,
			description:
				'Voice IDs are returned when a custom voice is created, and by the Get Many operation',
		});
	}

	const response = await apiRequest.call(
		this,
		'DELETE',
		`/voices/${encodeURIComponent(voiceId)}`,
		undefined,
		{ model },
	);
	return [{ json: response, pairedItem: { item: itemIndex } }];
}

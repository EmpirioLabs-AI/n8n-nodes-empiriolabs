import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';

import { apiRequest, isDataObject } from '../transport';

const SIMPLIFIED_MODEL_FIELDS = [
	'id',
	'display_name',
	'author',
	'category',
	'description',
	'context_window',
	'input_modalities',
	'output_modalities',
	'supported_endpoints',
	'pricing_rows',
];

export function simplifyModel(model: IDataObject): IDataObject {
	const simplified: IDataObject = {};
	for (const field of SIMPLIFIED_MODEL_FIELDS) {
		if (model[field] !== undefined) {
			simplified[field] = model[field];
		}
	}
	return simplified;
}

export function filterModels(models: IDataObject[], filters: IDataObject): IDataObject[] {
	let result = models;
	if (typeof filters.category === 'string' && filters.category !== '') {
		result = result.filter((model) => model.category === filters.category);
	}
	if (typeof filters.search === 'string' && filters.search.trim() !== '') {
		const needle = filters.search.trim().toLowerCase();
		result = result.filter((model) => {
			const aliases = Array.isArray(model.aliases) ? model.aliases : [];
			return [model.id, model.display_name, model.author, model.description, ...aliases].some(
				(value) => typeof value === 'string' && value.toLowerCase().includes(needle),
			);
		});
	}
	return result;
}

export async function getManyModels(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const returnAll = this.getNodeParameter('returnAll', itemIndex, false) as boolean;
	const filters = this.getNodeParameter('filters', itemIndex, {}) as IDataObject;
	const simplify = this.getNodeParameter('simplify', itemIndex, true) as boolean;

	const response = await apiRequest.call(this, 'GET', '/models');
	const models = Array.isArray(response.data)
		? (response.data as unknown[]).filter(isDataObject)
		: [];

	let result = filterModels(models, filters);
	if (!returnAll) {
		const limit = this.getNodeParameter('limit', itemIndex, 50) as number;
		result = result.slice(0, limit);
	}

	return result.map((model) => ({
		json: simplify ? simplifyModel(model) : model,
		pairedItem: { item: itemIndex },
	}));
}

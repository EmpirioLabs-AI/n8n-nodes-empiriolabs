import type { INodeProperties } from 'n8n-workflow';

export const MODEL_PARAMETERS_DESCRIPTION =
	'Extra request fields for the selected model as a JSON object, for example {"seed": 42}. Each model lists the fields it accepts in the <a href="https://docs.empiriolabs.ai/models-pricing">EmpirioLabs AI model catalog</a>.';

export function modelParametersOption(): INodeProperties {
	return {
		displayName: 'Model Parameters (JSON)',
		name: 'modelParameters',
		type: 'json',
		default: '{}',
		description: MODEL_PARAMETERS_DESCRIPTION,
	};
}

export function outputFieldOption(): INodeProperties {
	return {
		displayName: 'Put Output in Field',
		name: 'binaryPropertyOutput',
		type: 'string',
		default: 'data',
		hint: 'The name of the output field to put the binary file data in',
	};
}

/**
 * The fields of the Get Template and Get Many Templates operations of the Image and Video
 * resources. The template list and the model filter load from the API.
 */
export function templateFields(
	resource: 'image' | 'video',
	templatesMethod: string,
	modelsMethod: string,
): INodeProperties[] {
	const showForGet = { resource: [resource], operation: ['getTemplate'] };
	const showForGetAll = { resource: [resource], operation: ['getAllTemplates'] };
	return [
		{
			displayName: 'Template Name or ID',
			name: 'template',
			type: 'options',
			typeOptions: { loadOptionsMethod: templatesMethod },
			required: true,
			default: '',
			description:
				'The template to get. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			displayOptions: { show: showForGet },
		},
		{
			displayName: 'Return All',
			name: 'returnAll',
			type: 'boolean',
			default: false,
			description: 'Whether to return all results or only up to a given limit',
			displayOptions: { show: showForGetAll },
		},
		{
			displayName: 'Limit',
			name: 'limit',
			type: 'number',
			typeOptions: { minValue: 1 },
			default: 50,
			description: 'Max number of results to return',
			displayOptions: { show: { ...showForGetAll, returnAll: [false] } },
		},
		{
			displayName: 'Filters',
			name: 'filters',
			type: 'collection',
			placeholder: 'Add Filter',
			default: {},
			displayOptions: { show: showForGetAll },
			options: [
				{
					displayName: 'Category',
					name: 'category',
					type: 'string',
					default: '',
					placeholder: resource === 'image' ? 'e.g. product' : 'e.g. cinematic',
					description: 'Only return templates in this category',
				},
				{
					displayName: 'Featured Only',
					name: 'featured',
					type: 'boolean',
					default: true,
					description: 'Whether to return only featured templates',
				},
				{
					displayName: 'Model Name or ID',
					name: 'model',
					type: 'options',
					typeOptions: { loadOptionsMethod: modelsMethod },
					default: '',
					description:
						'Only return templates that support this model. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				},
			],
		},
	];
}

import type { INodeProperties } from 'n8n-workflow';

import { modelParametersOption } from './shared';

const showForSearch = { resource: ['webSearch'], operation: ['search'] };

export const searchOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['webSearch'] } },
		options: [
			{
				name: 'Search',
				value: 'search',
				description: 'Search the web with a search model and return its results',
				action: 'Search the web',
			},
		],
		default: 'search',
	},
];

export const searchFields: INodeProperties[] = [
	{
		displayName: 'Model Name or ID',
		name: 'model',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getSearchModels' },
		required: true,
		default: '',
		description:
			'The search model to use. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: { show: showForSearch },
	},
	{
		displayName: 'Query',
		name: 'query',
		type: 'string',
		typeOptions: { rows: 2 },
		required: true,
		default: '',
		placeholder: 'e.g. Open-weight model releases this week',
		description: 'What to search for',
		displayOptions: { show: showForSearch },
	},
	{
		displayName: 'Wait for Completion',
		name: 'waitForCompletion',
		type: 'boolean',
		default: true,
		description:
			'Whether to wait when a long search runs in the background. When off, the node returns the job, which the Job resource can get later.',
		displayOptions: { show: showForSearch },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: showForSearch },
		options: [
			{
				...modelParametersOption(),
				description:
					'Extra request fields for the selected search model as a JSON object, for example {"max_results": 5}. Each model lists the fields it accepts in the <a href="https://docs.empiriolabs.ai/models-pricing">EmpirioLabs AI model catalog</a>.',
			},
			{
				displayName: 'Timeout',
				name: 'timeout',
				type: 'number',
				typeOptions: { minValue: 30 },
				default: 600,
				description: 'Maximum time to wait for a long search, in seconds',
			},
		],
	},
];

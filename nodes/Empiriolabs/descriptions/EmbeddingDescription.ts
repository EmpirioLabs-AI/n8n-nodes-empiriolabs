import type { INodeProperties } from 'n8n-workflow';

import { modelParametersOption } from './shared';

const showForCreate = { resource: ['embedding'], operation: ['create'] };

export const embeddingOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['embedding'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Create an embedding vector for a text',
				action: 'Create an embedding',
			},
		],
		default: 'create',
	},
];

export const embeddingFields: INodeProperties[] = [
	{
		displayName: 'Model Name or ID',
		name: 'model',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getEmbeddingModels' },
		required: true,
		default: '',
		description:
			'The embedding model to use. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: { show: showForCreate },
	},
	{
		displayName: 'Text',
		name: 'text',
		type: 'string',
		typeOptions: { rows: 4 },
		required: true,
		default: '',
		placeholder: 'e.g. How do I reset my password?',
		description: 'The text to embed',
		displayOptions: { show: showForCreate },
	},
	{
		displayName: 'Simplify',
		name: 'simplify',
		type: 'boolean',
		default: true,
		description: 'Whether to return a simplified version of the response instead of the raw data',
		displayOptions: { show: showForCreate },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: showForCreate },
		options: [modelParametersOption()],
	},
];

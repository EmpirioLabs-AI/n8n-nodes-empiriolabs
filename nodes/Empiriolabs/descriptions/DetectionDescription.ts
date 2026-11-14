import type { INodeProperties } from 'n8n-workflow';

import { modelParametersOption } from './shared';

const showForDetect = { resource: ['detection'], operation: ['detect'] };

export const detectionOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['detection'] } },
		options: [
			{
				name: 'Detect AI Text',
				value: 'detect',
				description: 'Check whether a text was written by AI',
				action: 'Detect text written by AI',
			},
		],
		default: 'detect',
	},
];

export const detectionFields: INodeProperties[] = [
	{
		displayName: 'Model Name or ID',
		name: 'model',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getDetectionModels' },
		required: true,
		default: '',
		description:
			'The detection model to use. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: { show: showForDetect },
	},
	{
		displayName: 'Text',
		name: 'text',
		type: 'string',
		typeOptions: { rows: 4 },
		required: true,
		default: '',
		placeholder: 'e.g. The quick brown fox jumps over the lazy dog.',
		description: 'The text to check',
		displayOptions: { show: showForDetect },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: showForDetect },
		options: [
			modelParametersOption(),
			{
				displayName: 'Version',
				name: 'version',
				type: 'string',
				default: '',
				description:
					'The version of the detection model to scan with. Leave empty to use the newest version.',
			},
		],
	},
];

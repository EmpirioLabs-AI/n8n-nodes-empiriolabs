import type { INodeProperties } from 'n8n-workflow';

import { modelParametersOption, outputFieldOption } from './shared';

const showForGenerate = { resource: ['image'], operation: ['generate'] };

export const imageOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['image'] } },
		options: [
			{
				name: 'Generate',
				value: 'generate',
				description: 'Create images from a text prompt and return them as binary files',
				action: 'Generate an image',
			},
		],
		default: 'generate',
	},
];

export const imageFields: INodeProperties[] = [
	{
		displayName: 'Model Name or ID',
		name: 'model',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getImageModels' },
		required: true,
		default: '',
		description:
			'The image model to use. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: { show: showForGenerate },
	},
	{
		displayName: 'Prompt',
		name: 'prompt',
		type: 'string',
		typeOptions: { rows: 4 },
		required: true,
		default: '',
		placeholder: 'e.g. A glass cathedral at sunset with dramatic lighting',
		description: 'A description of the image to create',
		displayOptions: { show: showForGenerate },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: showForGenerate },
		options: [
			{
				displayName: 'Aspect Ratio',
				name: 'aspectRatio',
				type: 'string',
				default: '',
				placeholder: 'e.g. 16:9',
				description: 'The output aspect ratio. Supported values depend on the model.',
			},
			modelParametersOption(),
			{
				displayName: 'Number of Images',
				name: 'numberOfImages',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 4 },
				default: 1,
				description: 'How many images to create. Each image is returned as a separate item.',
			},
			outputFieldOption(),
			{
				displayName: 'Reference Image URLs',
				name: 'referenceImageUrls',
				type: 'string',
				default: '',
				placeholder: 'e.g. https://example.com/source.jpg',
				description:
					'Comma-separated URLs of images to edit or use as references, on models that support image input',
			},
			{
				displayName: 'Resolution',
				name: 'resolution',
				type: 'string',
				default: '',
				placeholder: 'e.g. 2K',
				description: 'The output resolution. Supported values depend on the model.',
			},
			{
				displayName: 'Timeout',
				name: 'timeout',
				type: 'number',
				typeOptions: { minValue: 10 },
				default: 300,
				description: 'Maximum time to wait for the images, in seconds',
			},
		],
	},
];

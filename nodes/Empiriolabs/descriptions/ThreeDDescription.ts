import type { INodeProperties } from 'n8n-workflow';

import { modelParametersOption, outputFieldOption } from './shared';

const showForGenerate = { resource: ['threeD'], operation: ['generate'] };

export const threeDOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['threeD'] } },
		options: [
			{
				name: 'Generate',
				value: 'generate',
				description: 'Start a 3D generation job from an image and optionally wait for the 3D file',
				action: 'Generate a 3D asset',
			},
		],
		default: 'generate',
	},
];

export const threeDFields: INodeProperties[] = [
	{
		displayName: 'Model Name or ID',
		name: 'model',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getThreeDModels' },
		required: true,
		default: '',
		description:
			'The 3D generation model to use. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: { show: showForGenerate },
	},
	{
		displayName: 'Input Type',
		name: 'imageSource',
		type: 'options',
		options: [
			{
				name: 'Binary File',
				value: 'binaryData',
				description: 'Use an image from a binary field of the input item',
			},
			{
				name: 'Image URL',
				value: 'url',
				description: 'Use an image from a public HTTPS URL',
			},
			{
				name: 'No Image',
				value: 'none',
				description: 'Send no image, on models that take their input from Model Parameters',
			},
		],
		default: 'binaryData',
		displayOptions: { show: showForGenerate },
	},
	{
		displayName: 'Input Data Field Name',
		name: 'binaryPropertyName',
		type: 'string',
		required: true,
		default: 'data',
		hint: 'The name of the input field containing the image',
		displayOptions: { show: { ...showForGenerate, imageSource: ['binaryData'] } },
	},
	{
		displayName: 'Image URL',
		name: 'imageUrl',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. https://example.com/product-photo.png',
		description: 'A public HTTPS URL of the image to turn into a 3D asset',
		displayOptions: { show: { ...showForGenerate, imageSource: ['url'] } },
	},
	{
		displayName: 'Wait for Completion',
		name: 'waitForCompletion',
		type: 'boolean',
		default: false,
		description:
			'Whether to wait for the 3D asset before continuing. When off, the node returns the job right away.',
		displayOptions: { show: showForGenerate },
	},
	{
		displayName: 'Timeout',
		name: 'timeout',
		type: 'number',
		typeOptions: { minValue: 30 },
		default: 900,
		description: 'Maximum time to wait for the 3D asset, in seconds',
		displayOptions: { show: { ...showForGenerate, waitForCompletion: [true] } },
	},
	{
		displayName: 'Download File',
		name: 'downloadFile',
		type: 'boolean',
		default: true,
		description: 'Whether to download the finished 3D file and return it as a binary file',
		displayOptions: { show: { ...showForGenerate, waitForCompletion: [true] } },
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
				displayName: 'Maximum Number of Tokens',
				name: 'maxNumTokens',
				type: 'number',
				typeOptions: { minValue: 1 },
				default: 49152,
				description: 'The maximum number of tokens to generate, on models that support it',
			},
			modelParametersOption(),
			{
				...outputFieldOption(),
				displayOptions: { show: { '/downloadFile': [true], '/waitForCompletion': [true] } },
			},
			{
				displayName: 'Remesh',
				name: 'remesh',
				type: 'boolean',
				default: true,
				description:
					'Whether to rebuild the mesh topology before export, on models that support it',
			},
			{
				displayName: 'Resolution',
				name: 'resolution',
				type: 'string',
				default: '',
				placeholder: 'e.g. 1024',
				description:
					'The generation resolution. Higher values add detail and take longer. Supported values depend on the model.',
			},
			{
				displayName: 'Seed',
				name: 'seed',
				type: 'number',
				typeOptions: { minValue: 0 },
				default: 42,
				description: 'A number that makes the result reproducible, on models that support it',
			},
			{
				displayName: 'Target Face Count',
				name: 'decimationTarget',
				type: 'number',
				typeOptions: { minValue: 1 },
				default: 500000,
				description: 'The target face count of the simplified mesh, on models that support it',
			},
			{
				displayName: 'Texture Size',
				name: 'textureSize',
				type: 'string',
				default: '',
				placeholder: 'e.g. 2048',
				description: 'The texture size in pixels, on models that support it',
			},
		],
	},
];

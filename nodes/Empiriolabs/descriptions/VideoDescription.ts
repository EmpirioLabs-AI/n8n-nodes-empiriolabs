import type { INodeProperties } from 'n8n-workflow';

import { modelParametersOption, outputFieldOption } from './shared';

const showForGenerate = { resource: ['video'], operation: ['generate'] };

export const videoOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['video'] } },
		options: [
			{
				name: 'Generate',
				value: 'generate',
				description: 'Start a video generation job and optionally wait for the video',
				action: 'Generate a video',
			},
		],
		default: 'generate',
	},
];

export const videoFields: INodeProperties[] = [
	{
		displayName: 'Model Name or ID',
		name: 'model',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getVideoModels' },
		required: true,
		default: '',
		description:
			'The video model to use. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: { show: showForGenerate },
	},
	{
		displayName: 'Prompt',
		name: 'prompt',
		type: 'string',
		typeOptions: { rows: 4 },
		required: true,
		default: '',
		placeholder: 'e.g. A slow dolly shot along a rainy city street at dusk',
		description: 'A description of the video to create',
		displayOptions: { show: showForGenerate },
	},
	{
		displayName: 'Wait for Completion',
		name: 'waitForCompletion',
		type: 'boolean',
		default: false,
		description:
			'Whether to wait for the video before continuing. When off, the node returns the job right away.',
		displayOptions: { show: showForGenerate },
	},
	{
		displayName: 'Timeout',
		name: 'timeout',
		type: 'number',
		typeOptions: { minValue: 30 },
		default: 900,
		description:
			'Maximum time to wait for the video, in seconds. Most videos finish in 1 to 15 minutes.',
		displayOptions: { show: { ...showForGenerate, waitForCompletion: [true] } },
	},
	{
		displayName: 'Download Video',
		name: 'downloadVideo',
		type: 'boolean',
		default: true,
		description: 'Whether to download the finished video and return it as a binary file',
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
				displayName: 'Aspect Ratio',
				name: 'aspectRatio',
				type: 'string',
				default: '',
				placeholder: 'e.g. 16:9',
				description: 'The output aspect ratio. Supported values depend on the model.',
			},
			{
				displayName: 'Duration',
				name: 'duration',
				type: 'number',
				typeOptions: { minValue: 1 },
				default: 5,
				description: 'The video length in seconds. Supported values depend on the model.',
			},
			{
				displayName: 'Generate Audio',
				name: 'generateAudio',
				type: 'boolean',
				default: true,
				description: 'Whether to also create an audio track, on models that support it',
			},
			{
				displayName: 'Image URL',
				name: 'imageUrl',
				type: 'string',
				default: '',
				placeholder: 'e.g. https://example.com/first-frame.jpg',
				description: 'URL of a starting image for image-to-video generation',
			},
			modelParametersOption(),
			{
				...outputFieldOption(),
				displayOptions: { show: { '/downloadVideo': [true], '/waitForCompletion': [true] } },
			},
			{
				displayName: 'Resolution',
				name: 'resolution',
				type: 'string',
				default: '',
				placeholder: 'e.g. 1080p',
				description: 'The output resolution. Supported values depend on the model.',
			},
		],
	},
];

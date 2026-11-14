import type { INodeProperties } from 'n8n-workflow';

import { modelParametersOption, outputFieldOption, templateFields } from './shared';

const showForAnalyze = { resource: ['image'], operation: ['analyze'] };
const showForEdit = { resource: ['image'], operation: ['edit'] };
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
				name: 'Analyze',
				value: 'analyze',
				description: 'Ask a question about an image and get the answer as text',
				action: 'Analyze an image',
			},
			{
				name: 'Edit',
				value: 'edit',
				description:
					'Change an image with a text instruction and return the result as binary files',
				action: 'Edit an image',
			},
			{
				name: 'Generate',
				value: 'generate',
				description: 'Create images from a text prompt and return them as binary files',
				action: 'Generate an image',
			},
			{
				name: 'Get Many Templates',
				value: 'getAllTemplates',
				description: 'Get many image templates',
				action: 'Get many image templates',
			},
			{
				name: 'Get Template',
				value: 'getTemplate',
				description: 'Get an image template',
				action: 'Get an image template',
			},
		],
		default: 'generate',
	},
];

export const imageFields: INodeProperties[] = [
	// ----------------------------------
	//         image: analyze
	// ----------------------------------
	{
		displayName: 'Model Name or ID',
		name: 'model',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getVisionModels' },
		required: true,
		default: '',
		description:
			'The model that answers the question. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: { show: showForAnalyze },
	},
	{
		displayName: 'Input Type',
		name: 'inputSource',
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
		],
		default: 'binaryData',
		displayOptions: { show: showForAnalyze },
	},
	{
		displayName: 'Input Data Field Name',
		name: 'binaryPropertyName',
		type: 'string',
		required: true,
		default: 'data',
		hint: 'The name of the input field containing the image',
		displayOptions: { show: { ...showForAnalyze, inputSource: ['binaryData'] } },
	},
	{
		displayName: 'Image URL',
		name: 'imageUrl',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. https://example.com/photo.jpg',
		description: 'A public HTTPS URL of the image',
		displayOptions: { show: { ...showForAnalyze, inputSource: ['url'] } },
	},
	{
		displayName: 'Question',
		name: 'question',
		type: 'string',
		typeOptions: { rows: 2 },
		required: true,
		default: '',
		placeholder: 'e.g. What is in this picture?',
		description: 'What you want to know about the image',
		displayOptions: { show: showForAnalyze },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: showForAnalyze },
		options: [
			{
				displayName: 'Seed',
				name: 'seed',
				type: 'number',
				default: 0,
				description: 'A number that makes the answer more reproducible, on models that support it',
			},
			{
				displayName: 'Temperature',
				name: 'temperature',
				type: 'number',
				typeOptions: { minValue: 0, numberPrecision: 2 },
				default: 0.7,
				description:
					'Controls randomness. Lower values give more focused answers, higher values more varied ones.',
			},
			{
				displayName: 'Top P',
				name: 'topP',
				type: 'number',
				typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 2 },
				default: 1,
				description:
					'Samples only from the most likely tokens whose probabilities add up to this value',
			},
		],
	},

	// ----------------------------------
	//         image: edit
	// ----------------------------------
	{
		displayName: 'Model Name or ID',
		name: 'model',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getImageEditModels' },
		required: true,
		default: '',
		description:
			'The image editing model to use. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: { show: showForEdit },
	},
	{
		displayName: 'Image URLs',
		name: 'imageUrls',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. https://example.com/source.jpg',
		description:
			'The HTTPS URL of the image to edit. Separate several URLs with commas, on models that take more than one image.',
		displayOptions: { show: showForEdit },
	},
	{
		displayName: 'Prompt',
		name: 'prompt',
		type: 'string',
		typeOptions: { rows: 4 },
		required: true,
		default: '',
		placeholder: 'e.g. Replace the background with a snowy mountain range',
		description: 'The change to make to the image',
		displayOptions: { show: showForEdit },
	},
	{
		displayName: 'Wait for Completion',
		name: 'waitForCompletion',
		type: 'boolean',
		default: true,
		description:
			'Whether to wait for the edited images before continuing. When off, the node returns the job, which the Job resource can get later.',
		displayOptions: { show: showForEdit },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: showForEdit },
		options: [
			modelParametersOption(),
			{
				...outputFieldOption(),
				displayOptions: { show: { '/waitForCompletion': [true] } },
			},
			{
				displayName: 'Timeout',
				name: 'timeout',
				type: 'number',
				typeOptions: { minValue: 10 },
				default: 300,
				description: 'Maximum time to wait for the edited images, in seconds',
				displayOptions: { show: { '/waitForCompletion': [true] } },
			},
		],
	},

	// ----------------------------------
	//         image: generate
	// ----------------------------------
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

	// ----------------------------------
	//         image: getTemplate, getAllTemplates
	// ----------------------------------
	...templateFields('image', 'getImageTemplates', 'getImageModels'),
];

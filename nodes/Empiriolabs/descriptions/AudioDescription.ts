import type { INodeProperties } from 'n8n-workflow';

import { modelParametersOption, outputFieldOption } from './shared';

const showForSpeech = { resource: ['audio'], operation: ['textToSpeech'] };
const showForTranscribe = { resource: ['audio'], operation: ['transcribe'] };

export const audioOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['audio'] } },
		options: [
			{
				name: 'Text to Speech',
				value: 'textToSpeech',
				description: 'Turn text into spoken audio and return it as a binary file',
				action: 'Convert text to speech',
			},
			{
				name: 'Transcribe',
				value: 'transcribe',
				description: 'Turn speech in an audio or video file into text',
				action: 'Transcribe audio',
			},
		],
		default: 'textToSpeech',
	},
];

export const audioFields: INodeProperties[] = [
	// ----------------------------------
	//         audio: textToSpeech
	// ----------------------------------
	{
		displayName: 'Model Name or ID',
		name: 'model',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getSpeechModels' },
		required: true,
		default: '',
		description:
			'The text to speech model to use. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: { show: showForSpeech },
	},
	{
		displayName: 'Text',
		name: 'text',
		type: 'string',
		typeOptions: { rows: 4 },
		required: true,
		default: '',
		placeholder: 'e.g. Thanks for calling. Your order has shipped.',
		description: 'The text to speak',
		displayOptions: { show: showForSpeech },
	},
	{
		displayName: 'Voice Name or ID',
		name: 'voice',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getVoices', loadOptionsDependsOn: ['model'] },
		default: '',
		description:
			'The voice to use. Model Default keeps the default voice of the model. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: { show: showForSpeech },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: showForSpeech },
		options: [
			{
				displayName: 'Language',
				name: 'language',
				type: 'string',
				default: '',
				placeholder: 'e.g. en-US',
				description: 'The language of the text, on models that accept a language code',
			},
			modelParametersOption(),
			{
				displayName: 'Output Format',
				name: 'outputFormat',
				type: 'string',
				default: '',
				placeholder: 'e.g. mp3',
				description: 'The audio file format. Supported values depend on the model.',
			},
			outputFieldOption(),
			{
				displayName: 'Timeout',
				name: 'timeout',
				type: 'number',
				typeOptions: { minValue: 10 },
				default: 300,
				description: 'Maximum time to wait for the audio, in seconds',
			},
		],
	},

	// ----------------------------------
	//         audio: transcribe
	// ----------------------------------
	{
		displayName: 'Model Name or ID',
		name: 'model',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getTranscriptionModels' },
		required: true,
		default: '',
		description:
			'The speech to text model to use. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: { show: showForTranscribe },
	},
	{
		displayName: 'Input Type',
		name: 'inputSource',
		type: 'options',
		options: [
			{
				name: 'Binary File',
				value: 'binaryData',
				description: 'Upload a file from a binary field of the input item',
			},
			{
				name: 'File URL',
				value: 'url',
				description: 'Transcribe a file from a public HTTPS URL',
			},
		],
		default: 'binaryData',
		displayOptions: { show: showForTranscribe },
	},
	{
		displayName: 'Input Data Field Name',
		name: 'binaryPropertyName',
		type: 'string',
		required: true,
		default: 'data',
		placeholder: 'e.g. data',
		hint: 'The name of the input field containing the binary file data to be processed',
		description: 'The binary field that holds the audio or video file',
		displayOptions: { show: { ...showForTranscribe, inputSource: ['binaryData'] } },
	},
	{
		displayName: 'File URL',
		name: 'fileUrl',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. https://example.com/recording.mp3',
		description: 'Public HTTPS URL of the audio or video file',
		displayOptions: { show: { ...showForTranscribe, inputSource: ['url'] } },
	},
	{
		displayName: 'Wait for Completion',
		name: 'waitForTranscript',
		type: 'boolean',
		default: true,
		description:
			'Whether to wait for the transcript before continuing. When off, the node returns the job so you can get the result later.',
		displayOptions: { show: showForTranscribe },
	},
	{
		displayName: 'Simplify',
		name: 'simplify',
		type: 'boolean',
		default: true,
		description: 'Whether to return a simplified version of the response instead of the raw data',
		displayOptions: { show: { ...showForTranscribe, waitForTranscript: [true] } },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: showForTranscribe },
		options: [
			{
				displayName: 'Language',
				name: 'language',
				type: 'string',
				default: '',
				placeholder: 'e.g. en',
				description: 'The spoken language as an ISO 639-1 code. Leave empty to detect it.',
			},
			modelParametersOption(),
			{
				displayName: 'Timeout',
				name: 'timeout',
				type: 'number',
				typeOptions: { minValue: 10 },
				default: 600,
				description: 'Maximum time to wait for the transcript, in seconds',
			},
		],
	},
];

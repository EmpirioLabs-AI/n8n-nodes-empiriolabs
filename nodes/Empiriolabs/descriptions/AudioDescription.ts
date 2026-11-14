import type { INodeProperties } from 'n8n-workflow';

import { modelParametersOption, outputFieldOption } from './shared';

const showForGenerate = { resource: ['audio'], operation: ['generate'] };
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
				name: 'Generate Music or Sound',
				value: 'generate',
				description: 'Start a music or sound effect job and optionally wait for the audio',
				action: 'Generate music or sound',
			},
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
	//         audio: generate
	// ----------------------------------
	{
		displayName: 'Model Name or ID',
		name: 'model',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getAudioGenerationModels' },
		required: true,
		default: '',
		description:
			'The music or sound model to use. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: { show: showForGenerate },
	},
	{
		displayName: 'Prompt',
		name: 'prompt',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		placeholder: 'e.g. Lo-fi hip hop with mellow piano and soft vinyl crackle',
		description: 'A description of the music or sound to create',
		displayOptions: { show: showForGenerate },
	},
	{
		displayName: 'Wait for Completion',
		name: 'waitForCompletion',
		type: 'boolean',
		default: false,
		description:
			'Whether to wait for the audio before continuing. When off, the node returns the job right away.',
		displayOptions: { show: showForGenerate },
	},
	{
		displayName: 'Timeout',
		name: 'timeout',
		type: 'number',
		typeOptions: { minValue: 30 },
		default: 600,
		description: 'Maximum time to wait for the audio, in seconds',
		displayOptions: { show: { ...showForGenerate, waitForCompletion: [true] } },
	},
	{
		displayName: 'Download Audio',
		name: 'downloadAudio',
		type: 'boolean',
		default: true,
		description: 'Whether to download the finished audio and return it as a binary file',
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
				displayName: 'Duration',
				name: 'duration',
				type: 'number',
				typeOptions: { minValue: 1 },
				default: 30,
				description:
					'The audio length in seconds. Some models name this field differently: check the model page and use Model Parameters for those.',
			},
			{
				displayName: 'Lyrics',
				name: 'lyrics',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				description: 'The lyrics to sing, on models that support it',
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
			{
				displayName: 'Prompt Adherence',
				name: 'cfgScale',
				type: 'number',
				typeOptions: { minValue: 0, numberPrecision: 2 },
				default: 1,
				description:
					'How closely the audio follows the prompt, on models that support it. Higher values follow the prompt more closely.',
			},
			{
				...outputFieldOption(),
				displayOptions: { show: { '/downloadAudio': [true], '/waitForCompletion': [true] } },
			},
			{
				displayName: 'Seed',
				name: 'seed',
				type: 'number',
				default: 0,
				description: 'A number that makes the result reproducible, on models that support it',
			},
			{
				displayName: 'Steps',
				name: 'steps',
				type: 'number',
				typeOptions: { minValue: 1 },
				default: 8,
				description:
					'The number of generation steps, on models that support it. More steps take longer.',
			},
		],
	},

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

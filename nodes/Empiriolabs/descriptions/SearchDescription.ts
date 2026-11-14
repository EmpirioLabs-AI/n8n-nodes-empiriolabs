import type { INodeProperties } from 'n8n-workflow';

import { modelParametersOption } from './shared';

const showForAnswer = { resource: ['webSearch'], operation: ['answer'] };
const showForResearch = { resource: ['webSearch'], operation: ['research'] };
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
				name: 'Answer',
				value: 'answer',
				description: 'Answer a question from the web and return the answer with its sources',
				action: 'Answer a question from the web',
			},
			{
				name: 'Research',
				value: 'research',
				description: 'Research a question on the web and return a report with citations',
				action: 'Research a question on the web',
			},
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
	// ----------------------------------
	//         webSearch: answer
	// ----------------------------------
	{
		displayName: 'Model Name or ID',
		name: 'model',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getAnswerModels' },
		required: true,
		default: '',
		description:
			'The answer model to use. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: { show: showForAnswer },
	},
	{
		displayName: 'Query',
		name: 'query',
		type: 'string',
		typeOptions: { rows: 2 },
		required: true,
		default: '',
		placeholder: 'e.g. When was the last total solar eclipse visible from Europe?',
		description: 'The question to answer',
		displayOptions: { show: showForAnswer },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: showForAnswer },
		options: [
			{
				displayName: 'Disable Formatting',
				name: 'disableFormatting',
				type: 'boolean',
				default: true,
				description: 'Whether to return the answer without the list of sources added to its text',
			},
			{
				displayName: 'Include Source Text',
				name: 'includeText',
				type: 'boolean',
				default: true,
				description: 'Whether to return the text of each source with the results',
			},
			modelParametersOption(),
		],
	},

	// ----------------------------------
	//         webSearch: research
	// ----------------------------------
	{
		displayName: 'Model Name or ID',
		name: 'model',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getResearchModels' },
		required: true,
		default: '',
		description:
			'The research model to use. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: { show: showForResearch },
	},
	{
		displayName: 'Query',
		name: 'query',
		type: 'string',
		typeOptions: { rows: 2 },
		required: true,
		default: '',
		placeholder: 'e.g. How are cities adapting public transport to heat waves?',
		description: 'The question to research',
		displayOptions: { show: showForResearch },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: showForResearch },
		options: [
			{
				displayName: 'Citation Format',
				name: 'citationFormat',
				type: 'options',
				options: [
					{ name: 'APA', value: 'apa' },
					{ name: 'Chicago', value: 'chicago' },
					{ name: 'MLA', value: 'mla' },
					{ name: 'Numbered', value: 'numbered' },
				],
				default: 'numbered',
				description: 'The citation style of the report',
			},
			{
				displayName: 'Disable Formatting',
				name: 'disableFormatting',
				type: 'boolean',
				default: true,
				description: 'Whether to return the report without the added Markdown formatting',
			},
			modelParametersOption(),
			{
				displayName: 'Research Depth',
				name: 'researchDepth',
				type: 'options',
				options: [
					{ name: 'Auto', value: 'auto' },
					{ name: 'Mini', value: 'mini' },
					{ name: 'Pro', value: 'pro' },
				],
				default: 'auto',
				description: 'How deep the research goes, on models that support it',
			},
			{
				displayName: 'Timeout',
				name: 'timeout',
				type: 'number',
				typeOptions: { minValue: 30 },
				default: 900,
				description: 'Maximum time to wait for the report, in seconds',
			},
		],
	},

	// ----------------------------------
	//         webSearch: search
	// ----------------------------------
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

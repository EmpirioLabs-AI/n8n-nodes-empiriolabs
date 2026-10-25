import type { INodeProperties } from 'n8n-workflow';

const showForRun = { resource: ['tool'], operation: ['run'] };

export const toolOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['tool'] } },
		options: [
			{
				name: 'Run',
				value: 'run',
				description:
					'Run any EmpirioLabs AI tool, such as reading a document, searching the web or generating media',
				action: 'Run a tool',
			},
		],
		default: 'run',
	},
];

export const toolFields: INodeProperties[] = [
	{
		displayName: 'Tool Name or ID',
		name: 'tool',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getTools' },
		required: true,
		default: '',
		description:
			'The EmpirioLabs AI tool to run. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: { show: showForRun },
	},
	{
		displayName: 'Specify Arguments',
		name: 'inputMode',
		type: 'options',
		options: [
			{
				name: 'Using Fields Below',
				value: 'fields',
				description: 'Enter each argument of the tool in its own field',
			},
			{
				name: 'Using JSON',
				value: 'json',
				description: 'Enter all arguments of the tool as one JSON object',
			},
		],
		default: 'fields',
		displayOptions: { show: showForRun },
	},
	{
		displayName: 'Arguments',
		name: 'toolArguments',
		type: 'resourceMapper',
		noDataExpression: true,
		default: { mappingMode: 'defineBelow', value: null },
		typeOptions: {
			loadOptionsDependsOn: ['tool'],
			resourceMapper: {
				resourceMapperMethod: 'getToolFields',
				mode: 'add',
				fieldWords: { singular: 'argument', plural: 'arguments' },
				addAllFields: true,
				multiKeyMatch: false,
				supportAutoMap: false,
			},
		},
		displayOptions: { show: { ...showForRun, inputMode: ['fields'] } },
	},
	{
		displayName: 'Arguments (JSON)',
		name: 'jsonArguments',
		type: 'json',
		required: true,
		default: '{}',
		description: 'The arguments of the tool as a JSON object, for example {"query": "open models"}',
		displayOptions: { show: { ...showForRun, inputMode: ['json'] } },
	},
];

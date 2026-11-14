import type { INodeProperties } from 'n8n-workflow';

import { modelParametersOption } from './shared';

const showForRerank = { resource: ['rerank'], operation: ['rerank'] };

export const rerankOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['rerank'] } },
		options: [
			{
				name: 'Rerank Documents',
				value: 'rerank',
				description: 'Sort documents by how relevant they are to a query',
				action: 'Rerank documents',
			},
		],
		default: 'rerank',
	},
];

export const rerankFields: INodeProperties[] = [
	{
		displayName: 'Model Name or ID',
		name: 'model',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getRerankModels' },
		required: true,
		default: '',
		description:
			'The reranking model to use. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: { show: showForRerank },
	},
	{
		displayName: 'Query',
		name: 'query',
		type: 'string',
		typeOptions: { rows: 2 },
		required: true,
		default: '',
		placeholder: 'e.g. How do I reset my password?',
		description: 'The text to rank the documents against',
		displayOptions: { show: showForRerank },
	},
	{
		displayName: 'Specify Documents',
		name: 'documentsMode',
		type: 'options',
		options: [
			{
				name: 'Using Fields Below',
				value: 'fields',
				description: 'Add each document as its own field',
			},
			{
				name: 'Using JSON',
				value: 'json',
				description:
					'Enter the documents as a JSON array of texts, or map a list with an expression',
			},
		],
		default: 'fields',
		displayOptions: { show: showForRerank },
	},
	{
		displayName: 'Documents',
		name: 'documents',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true, sortable: true },
		placeholder: 'Add Document',
		default: {},
		description: 'The documents to rank',
		displayOptions: { show: { ...showForRerank, documentsMode: ['fields'] } },
		options: [
			{
				displayName: 'Document',
				name: 'values',
				values: [
					{
						displayName: 'Text',
						name: 'text',
						type: 'string',
						typeOptions: { rows: 2 },
						default: '',
						description: 'The text of the document',
					},
				],
			},
		],
	},
	{
		displayName: 'Documents (JSON)',
		name: 'documentsJson',
		type: 'json',
		required: true,
		default: '[]',
		description:
			'The documents to rank, as a JSON array of texts such as ["First text", "Second text"]',
		displayOptions: { show: { ...showForRerank, documentsMode: ['json'] } },
	},
	{
		displayName: 'Simplify',
		name: 'simplify',
		type: 'boolean',
		default: true,
		description: 'Whether to return a simplified version of the response instead of the raw data',
		displayOptions: { show: showForRerank },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: showForRerank },
		options: [
			{
				displayName: 'Instruction',
				name: 'instruct',
				type: 'string',
				default: '',
				placeholder: 'e.g. Retrieve semantically similar text.',
				description: 'An instruction in English that guides the ranking',
			},
			modelParametersOption(),
			{
				displayName: 'Return Documents',
				name: 'returnDocuments',
				type: 'boolean',
				default: true,
				description: 'Whether the response includes the text of each document with its score',
			},
			{
				displayName: 'Top N',
				name: 'topN',
				type: 'number',
				typeOptions: { minValue: 1 },
				default: 10,
				description:
					'The number of top-ranked documents to return. Every document is returned when this is not set.',
			},
		],
	},
];

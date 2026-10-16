import type { INodeProperties } from 'n8n-workflow';

import { modelParametersOption } from './shared';

const showForCreate = { resource: ['chat'], operation: ['create'] };

export const chatOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['chat'] } },
		options: [
			{
				name: 'Create Completion',
				value: 'create',
				description: 'Send a prompt or a conversation to a chat model and get its reply',
				action: 'Create a chat completion',
			},
		],
		default: 'create',
	},
];

export const chatFields: INodeProperties[] = [
	{
		displayName: 'Model Name or ID',
		name: 'model',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getChatModels' },
		required: true,
		default: '',
		description:
			'The chat model to use. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: { show: showForCreate },
	},
	{
		displayName: 'Input Type',
		name: 'inputType',
		type: 'options',
		options: [
			{
				name: 'Prompt',
				value: 'prompt',
				description: 'A single user prompt with an optional system message',
			},
			{
				name: 'Messages',
				value: 'messages',
				description: 'A conversation made of system, user, and assistant messages',
			},
		],
		default: 'prompt',
		displayOptions: { show: showForCreate },
	},
	{
		displayName: 'Prompt',
		name: 'prompt',
		type: 'string',
		typeOptions: { rows: 4 },
		required: true,
		default: '',
		placeholder: 'e.g. Summarize this support ticket in three bullet points',
		description: 'The user message to send to the model',
		displayOptions: { show: { ...showForCreate, inputType: ['prompt'] } },
	},
	{
		displayName: 'Messages',
		name: 'messages',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true, sortable: true },
		placeholder: 'Add Message',
		default: {},
		description: 'The conversation to send, in order',
		displayOptions: { show: { ...showForCreate, inputType: ['messages'] } },
		options: [
			{
				displayName: 'Message',
				name: 'values',
				values: [
					{
						displayName: 'Role',
						name: 'role',
						type: 'options',
						options: [
							{ name: 'Assistant', value: 'assistant' },
							{ name: 'System', value: 'system' },
							{ name: 'User', value: 'user' },
						],
						default: 'user',
						description: 'Who wrote the message',
					},
					{
						displayName: 'Content',
						name: 'content',
						type: 'string',
						typeOptions: { rows: 2 },
						default: '',
						description: 'The text of the message',
					},
				],
			},
		],
	},
	{
		displayName: 'Simplify',
		name: 'simplify',
		type: 'boolean',
		default: true,
		description: 'Whether to return a simplified version of the response instead of the raw data',
		displayOptions: { show: showForCreate },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: showForCreate },
		options: [
			{
				displayName: 'Maximum Number of Tokens',
				name: 'maxTokens',
				type: 'number',
				typeOptions: { minValue: 1 },
				default: 1024,
				description: 'The maximum number of tokens the model can generate in its reply',
			},
			modelParametersOption(),
			{
				displayName: 'Response Format',
				name: 'responseFormat',
				type: 'options',
				options: [
					{
						name: 'JSON Object',
						value: 'json_object',
						description: 'Ask the model to reply with a valid JSON object',
					},
					{ name: 'Text', value: 'text', description: 'Reply with plain text' },
				],
				default: 'text',
				description: 'The format of the reply, on models that support structured output',
			},
			{
				displayName: 'System Message',
				name: 'systemMessage',
				type: 'string',
				typeOptions: { rows: 2 },
				default: '',
				placeholder: 'e.g. You are a concise assistant for a support team',
				description: 'Instructions that set how the model behaves, sent before the prompt',
				displayOptions: { show: { '/inputType': ['prompt'] } },
			},
			{
				displayName: 'Temperature',
				name: 'temperature',
				type: 'number',
				typeOptions: { minValue: 0, maxValue: 2, numberPrecision: 2 },
				default: 0.7,
				description:
					'Controls randomness. Lower values give more focused replies, higher values more varied ones.',
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
];

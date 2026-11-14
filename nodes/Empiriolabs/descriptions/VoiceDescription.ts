import type { INodeProperties } from 'n8n-workflow';

const showForDelete = { resource: ['voice'], operation: ['delete'] };
const showForGetAll = { resource: ['voice'], operation: ['getAll'] };

export const voiceOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['voice'] } },
		options: [
			{
				name: 'Delete',
				value: 'delete',
				description: 'Delete a custom voice. This cannot be undone.',
				action: 'Delete a voice',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get many voices',
				action: 'Get many voices',
			},
		],
		default: 'getAll',
	},
];

export const voiceFields: INodeProperties[] = [
	// ----------------------------------
	//         voice: delete
	// ----------------------------------
	{
		displayName: 'Model Name or ID',
		name: 'model',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getVoiceModels' },
		required: true,
		default: '',
		description:
			'The text to speech model the voice was created on. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: { show: showForDelete },
	},
	{
		displayName: 'Voice',
		name: 'voiceId',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description: 'The custom voice to delete. The list shows your custom voices on the model.',
		typeOptions: { loadOptionsDependsOn: ['model'] },
		displayOptions: { show: showForDelete },
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: {
					searchListMethod: 'searchCustomVoices',
					searchable: true,
				},
			},
			{
				displayName: 'ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. el_voice_9f2c1a7e',
			},
		],
	},

	// ----------------------------------
	//         voice: getAll
	// ----------------------------------
	{
		displayName: 'Model Name or ID',
		name: 'model',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getVoiceModels' },
		required: true,
		default: '',
		description:
			'The text to speech model whose voices to return. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: { show: showForGetAll },
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: { show: showForGetAll },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: { show: { ...showForGetAll, returnAll: [false] } },
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		description: 'Each filter works on the models that support it',
		displayOptions: { show: showForGetAll },
		options: [
			{
				displayName: 'Gender',
				name: 'gender',
				type: 'string',
				default: '',
				placeholder: 'e.g. female',
				description: 'Only return voices of this gender',
			},
			{
				displayName: 'Language',
				name: 'language',
				type: 'string',
				default: '',
				placeholder: 'e.g. en',
				description:
					'Only return voices of this language. Some models take a language code, others a language name.',
			},
			{
				displayName: 'Multilingual',
				name: 'multilingual',
				type: 'boolean',
				default: true,
				description:
					'Whether to return only the voices that speak every supported language. When off, those voices are left out.',
			},
			{
				displayName: 'Pitch',
				name: 'pitch',
				type: 'options',
				options: [
					{ name: 'High', value: 'high' },
					{ name: 'Low', value: 'low' },
					{ name: 'Medium', value: 'medium' },
				],
				default: 'medium',
				description: 'Only return voices of this pitch',
			},
			{
				displayName: 'Search',
				name: 'search',
				type: 'string',
				default: '',
				placeholder: 'e.g. warm narrator',
				description: 'Only return voices that match this text',
			},
			{
				displayName: 'Tier',
				name: 'tier',
				type: 'string',
				default: '',
				placeholder: 'e.g. flash',
				description: 'Only return voices that this tier of the model can use',
			},
			{
				displayName: 'Type',
				name: 'type',
				type: 'options',
				options: [
					{
						name: 'Custom',
						value: 'custom',
						description: 'Only the custom voices of your account',
					},
					{
						name: 'Preset',
						value: 'system',
						description: 'Only the preset voices of the model',
					},
				],
				default: 'custom',
				description: 'Only return voices of this type',
			},
		],
	},
];

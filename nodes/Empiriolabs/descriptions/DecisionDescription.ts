import type { INodeProperties } from 'n8n-workflow';

const showForCreate = { resource: ['decision'], operation: ['create'] };

const DECISIONS_GUIDE =
	'<a href="https://docs.empiriolabs.ai/decisions">EmpirioLabs AI Decisions guide</a>';

const questionId: INodeProperties = {
	displayName: 'ID',
	name: 'id',
	type: 'string',
	default: '',
	placeholder: 'e.g. is_urgent',
	description: 'A name you choose for the question. Its answer is returned under this ID.',
};

function questionInstructions(placeholder: string): INodeProperties {
	return {
		displayName: 'Instructions',
		name: 'instructions',
		type: 'string',
		typeOptions: { rows: 2 },
		default: '',
		placeholder,
		description: 'The question to answer',
	};
}

const returnAbstainProbability: INodeProperties = {
	displayName: 'Return Abstain Probability',
	name: 'abstain',
	type: 'boolean',
	default: false,
	description:
		'Whether to also return the probability that the state does not hold what the question needs',
};

export const decisionOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['decision'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Answer questions about a text or a JSON value with probabilities',
				action: 'Create a decision',
			},
		],
		default: 'create',
	},
];

export const decisionFields: INodeProperties[] = [
	{
		displayName: 'Model Name or ID',
		name: 'model',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getDecisionModels' },
		required: true,
		default: '',
		description:
			'The decision model to use. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: { show: showForCreate },
	},
	{
		displayName: 'State Type',
		name: 'stateType',
		type: 'options',
		options: [
			{
				name: 'Text',
				value: 'text',
				description: 'Decide about a text',
			},
			{
				name: 'JSON',
				value: 'json',
				description: 'Decide about a JSON object or array, which can hold images, audio, or video',
			},
		],
		default: 'text',
		description: 'The form of the state, the content the questions are about',
		displayOptions: { show: showForCreate },
	},
	{
		displayName: 'State',
		name: 'stateText',
		type: 'string',
		typeOptions: { rows: 4 },
		required: true,
		default: '',
		placeholder: 'e.g. I was charged twice this month and I need a refund today.',
		description: 'The text to decide about',
		displayOptions: { show: { ...showForCreate, stateType: ['text'] } },
	},
	{
		displayName: 'State (JSON)',
		name: 'stateJson',
		type: 'json',
		required: true,
		default: '{}',
		description: `The JSON object or array to decide about. It can hold images, audio clips, and videos as media objects, which the ${DECISIONS_GUIDE} describes.`,
		displayOptions: { show: { ...showForCreate, stateType: ['json'] } },
	},
	{
		displayName: 'Specify Questions',
		name: 'questionsMode',
		type: 'options',
		options: [
			{
				name: 'Using Fields Below',
				value: 'fields',
				description: 'Add each question with its own fields',
			},
			{
				name: 'Using JSON',
				value: 'json',
				description: 'Enter every question as one JSON object',
			},
		],
		default: 'fields',
		displayOptions: { show: showForCreate },
	},
	{
		displayName: 'Questions',
		name: 'questions',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Question',
		default: {},
		description:
			'The questions to answer, each of one type. Every question is answered on its own.',
		displayOptions: { show: { ...showForCreate, questionsMode: ['fields'] } },
		options: [
			{
				displayName: 'Choice',
				name: 'choice',
				values: [
					questionId,
					questionInstructions('e.g. Which team should handle this message?'),
					{
						displayName: 'Options',
						name: 'choices',
						type: 'string',
						typeOptions: { rows: 3 },
						default: '',
						placeholder: 'e.g. billing: Charges, refunds, and invoices',
						description:
							'The options to choose from, one per line. To describe an option, add a colon and a description after its name.',
					},
					returnAbstainProbability,
				],
			},
			{
				displayName: 'Score',
				name: 'score',
				values: [
					questionId,
					questionInstructions('e.g. How frustrated is the customer?'),
					{
						displayName: 'Levels',
						name: 'levels',
						type: 'string',
						typeOptions: { rows: 3 },
						default: '',
						placeholder: 'e.g. Calm',
						description: 'The levels of the scale, one per line, from lowest to highest',
					},
					returnAbstainProbability,
				],
			},
			{
				displayName: 'Tool',
				name: 'tool',
				values: [
					questionId,
					questionInstructions('e.g. Which function should handle this request?'),
					{
						displayName: 'Functions (JSON)',
						name: 'tools',
						type: 'json',
						default: '[]',
						description:
							'The functions to choose from, as a JSON array of function definitions in the format that chat completions use for tools',
					},
					{
						displayName: 'Allow No Function',
						name: 'allowNone',
						type: 'boolean',
						default: true,
						description: 'Whether the answer can be that no function applies',
					},
				],
			},
			{
				displayName: 'Yes or No',
				name: 'noul',
				values: [
					questionId,
					questionInstructions('e.g. Does the customer need a resolution today?'),
					{
						displayName: 'Meaning of No',
						name: 'noCriteria',
						type: 'string',
						default: '',
						description: 'What counts as no. Optional.',
					},
					{
						displayName: 'Meaning of Yes',
						name: 'yesCriteria',
						type: 'string',
						default: '',
						description: 'What counts as yes. Optional.',
					},
					returnAbstainProbability,
				],
			},
		],
	},
	{
		displayName: 'Questions (JSON)',
		name: 'questionsJson',
		type: 'json',
		required: true,
		default:
			'{\n  "is_urgent": {\n    "type": "noul",\n    "instructions": "Does the customer need a resolution today?"\n  }\n}',
		description: `The questions as a JSON object keyed by an ID you choose. Each question has a type (noul, choice, score, or tool) and instructions. The ${DECISIONS_GUIDE} lists every field.`,
		displayOptions: { show: { ...showForCreate, questionsMode: ['json'] } },
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
				displayName: 'Long Context',
				name: 'longContext',
				type: 'options',
				options: [
					{
						name: 'Fast',
						value: 'fast',
						description: 'Answers faster on a very long state',
					},
					{
						name: 'Full',
						value: 'full',
						description: 'Reads every token of a very long state',
					},
				],
				default: 'fast',
				description: 'How a very long state is read',
			},
		],
	},
];

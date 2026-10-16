import type { INodeProperties } from 'n8n-workflow';

import { outputFieldOption } from './shared';

const showForGet = { resource: ['job'], operation: ['get'] };
const showForGetAll = { resource: ['job'], operation: ['getAll'] };

export const jobOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['job'] } },
		options: [
			{
				name: 'Get',
				value: 'get',
				description: 'Get the status and result of a job',
				action: 'Get a job',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get many jobs',
				action: 'Get many jobs',
			},
		],
		default: 'get',
	},
];

export const jobFields: INodeProperties[] = [
	// ----------------------------------
	//         job: get
	// ----------------------------------
	{
		displayName: 'Job',
		name: 'jobId',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description: 'The job to get. Jobs from the last hour are listed.',
		displayOptions: { show: showForGet },
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: {
					searchListMethod: 'searchJobs',
					searchable: true,
				},
			},
			{
				displayName: 'ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. job_01HV3KABCDE',
			},
		],
	},
	{
		displayName: 'Download Output',
		name: 'downloadOutput',
		type: 'boolean',
		default: false,
		description:
			'Whether to download the file of a completed job, such as a video or image, as binary data',
		displayOptions: { show: showForGet },
	},
	{
		...outputFieldOption(),
		displayOptions: { show: { ...showForGet, downloadOutput: [true] } },
	},

	// ----------------------------------
	//         job: getAll
	// ----------------------------------
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
		typeOptions: { minValue: 1, maxValue: 100 },
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
		displayOptions: { show: showForGetAll },
		options: [
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				options: [
					{ name: 'Completed', value: 'completed' },
					{ name: 'Failed', value: 'failed' },
					{ name: 'Processing', value: 'processing' },
				],
				default: 'completed',
				description: 'Only return jobs with this status',
			},
		],
	},
];

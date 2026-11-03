import type { INodeProperties } from 'n8n-workflow';

import { modelParametersOption } from './shared';

const showForRead = { resource: ['document'], operation: ['read'] };

export const documentOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['document'] } },
		options: [
			{
				name: 'Read',
				value: 'read',
				description: 'Read a PDF or an image and return every page as Markdown',
				action: 'Read a document',
			},
		],
		default: 'read',
	},
];

export const documentFields: INodeProperties[] = [
	{
		displayName: 'Model Name or ID',
		name: 'model',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getDocumentModels' },
		required: true,
		default: '',
		description:
			'The document reading (OCR) model to use. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: { show: showForRead },
	},
	{
		displayName: 'Input Type',
		name: 'inputSource',
		type: 'options',
		options: [
			{
				name: 'Binary File',
				value: 'binaryData',
				description: 'Read a PDF or an image from a binary field of the input item',
			},
			{
				name: 'File URL',
				value: 'url',
				description: 'Read a PDF or an image from a public HTTPS URL',
			},
		],
		default: 'binaryData',
		displayOptions: { show: showForRead },
	},
	{
		displayName: 'Input Data Field Name',
		name: 'binaryPropertyName',
		type: 'string',
		required: true,
		default: 'data',
		hint: 'The name of the input field containing the PDF or image',
		displayOptions: { show: { ...showForRead, inputSource: ['binaryData'] } },
	},
	{
		displayName: 'File URL',
		name: 'fileUrl',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. https://example.com/invoice.pdf',
		description: 'A public HTTPS URL of a PDF or an image',
		displayOptions: { show: { ...showForRead, inputSource: ['url'] } },
	},
	{
		displayName: 'File Type',
		name: 'fileType',
		type: 'options',
		options: [
			{ name: 'PDF', value: 'pdf' },
			{
				name: 'Image',
				value: 'image',
				description: 'A PNG, JPEG, WebP, TIFF, BMP, GIF or AVIF image',
			},
		],
		default: 'pdf',
		description: 'Whether the URL points to a PDF or an image',
		displayOptions: { show: { ...showForRead, inputSource: ['url'] } },
	},
	{
		displayName: 'Wait for Completion',
		name: 'waitForCompletion',
		type: 'boolean',
		default: true,
		description:
			'Whether to wait when a long document is read in the background. When off, the node returns the job, which the Job resource can get later.',
		displayOptions: { show: showForRead },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: showForRead },
		options: [
			{
				displayName: 'Extract Footer',
				name: 'extractFooter',
				type: 'boolean',
				default: false,
				description: 'Whether to move the footer text out of each page into its own field',
			},
			{
				displayName: 'Extract Header',
				name: 'extractHeader',
				type: 'boolean',
				default: false,
				description: 'Whether to move the header text out of each page into its own field',
			},
			{
				displayName: 'Image Limit',
				name: 'imageLimit',
				type: 'number',
				typeOptions: { minValue: 0 },
				default: 0,
				description:
					'Return at most this many images for the whole document, the first ones first. 0 returns every image.',
			},
			{
				displayName: 'Image Minimum Size',
				name: 'imageMinSize',
				type: 'number',
				typeOptions: { minValue: 0 },
				default: 0,
				description: 'Leave out image regions narrower or shorter than this many pixels',
			},
			{
				displayName: 'Include Image Data',
				name: 'includeImageBase64',
				type: 'boolean',
				default: false,
				description: 'Whether to return each image region as a JPEG data URI',
			},
			modelParametersOption(),
			{
				displayName: 'Pages',
				name: 'pages',
				type: 'string',
				default: '',
				placeholder: 'e.g. 0,2-4',
				description: 'The pages to read, counted from 0. Every page when empty.',
			},
			{
				displayName: 'Table Format',
				name: 'tableFormat',
				type: 'options',
				options: [
					{ name: 'Keep in Page', value: '' },
					{ name: 'HTML', value: 'html' },
					{ name: 'Markdown', value: 'markdown' },
				],
				default: '',
				description: 'Whether to move each table out of its page into a list of tables, in this format',
			},
			{
				displayName: 'Timeout',
				name: 'timeout',
				type: 'number',
				typeOptions: { minValue: 30 },
				default: 600,
				description: 'Maximum time to wait for a long document, in seconds',
			},
		],
	},
];

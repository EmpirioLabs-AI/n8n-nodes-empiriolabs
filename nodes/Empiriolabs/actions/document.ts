import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	apiRequest,
	isDataObject,
	isJobEnvelope,
	parseJsonObjectParameter,
	waitForJob,
} from '../transport';

const IMAGE_TYPES = [
	'image/png',
	'image/jpeg',
	'image/webp',
	'image/tiff',
	'image/bmp',
	'image/gif',
	'image/avif',
];

/** Every page's Markdown joined into one text, in page order. */
export function documentText(result: IDataObject): string {
	const pages = Array.isArray(result.pages) ? (result.pages as unknown[]).filter(isDataObject) : [];
	return pages
		.map((page) => (typeof page.markdown === 'string' ? page.markdown.trim() : ''))
		.filter((markdown) => markdown !== '')
		.join('\n\n');
}

/**
 * The document field of an OCR request: a PDF as `document_url`, an image as `image_url`,
 * each a public URL or a base64 data URI.
 */
export function ocrDocument(kind: 'pdf' | 'image', url: string): IDataObject {
	return kind === 'pdf'
		? { type: 'document_url', document_url: url }
		: { type: 'image_url', image_url: url };
}

async function documentFromBinary(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex) as string;
	const binaryData = this.helpers.assertBinaryData(itemIndex, binaryPropertyName);
	const mimeType = String(binaryData.mimeType ?? '').toLowerCase();
	const extension = String(binaryData.fileExtension ?? '').toLowerCase();
	const isPdf = mimeType === 'application/pdf' || extension === 'pdf';
	if (!isPdf && !IMAGE_TYPES.includes(mimeType)) {
		throw new NodeOperationError(this.getNode(), 'The file is not a PDF or a supported image', {
			itemIndex,
			description: `The field "${binaryPropertyName}" holds a file of type "${mimeType || 'unknown'}". Read a PDF, or a PNG, JPEG, WebP, TIFF, BMP, GIF or AVIF image.`,
		});
	}
	const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
	const dataUri = `data:${isPdf ? 'application/pdf' : mimeType};base64,${buffer.toString('base64')}`;
	return ocrDocument(isPdf ? 'pdf' : 'image', dataUri);
}

export async function buildDocumentBody(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const model = this.getNodeParameter('model', itemIndex) as string;
	const inputSource = this.getNodeParameter('inputSource', itemIndex, 'binaryData') as string;
	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;

	let document: IDataObject;
	if (inputSource === 'url') {
		const fileUrl = (this.getNodeParameter('fileUrl', itemIndex) as string).trim();
		const fileType = this.getNodeParameter('fileType', itemIndex, 'pdf') as string;
		document = ocrDocument(fileType === 'image' ? 'image' : 'pdf', fileUrl);
	} else {
		document = await documentFromBinary.call(this, itemIndex);
	}

	const optional: IDataObject = {};
	if (typeof options.pages === 'string' && options.pages.trim() !== '') {
		optional.pages = options.pages.trim();
	}
	if (typeof options.tableFormat === 'string' && options.tableFormat !== '') {
		optional.table_format = options.tableFormat;
	}
	if (options.extractHeader === true) {
		optional.extract_header = true;
	}
	if (options.extractFooter === true) {
		optional.extract_footer = true;
	}
	if (options.includeImageBase64 === true) {
		optional.include_image_base64 = true;
	}
	if (typeof options.imageLimit === 'number' && options.imageLimit > 0) {
		optional.image_limit = options.imageLimit;
	}
	if (typeof options.imageMinSize === 'number' && options.imageMinSize > 0) {
		optional.image_min_size = options.imageMinSize;
	}
	const extra = parseJsonObjectParameter.call(
		this,
		options.modelParameters,
		'Model Parameters (JSON)',
		itemIndex,
	);
	return { ...optional, ...extra, model, document };
}

/**
 * Reads a PDF or an image with a document OCR model. The output is the API's result with every
 * page's Markdown, plus `text`, the whole document as one Markdown text. A long document that is
 * still being read after a few minutes comes back as a job, which the node waits for by default.
 */
export async function readDocument(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;
	const body = await buildDocumentBody.call(this, itemIndex);
	const response = await apiRequest.call(this, 'POST', '/ocr', body);

	if (!isJobEnvelope(response)) {
		return [{ json: { text: documentText(response), ...response }, pairedItem: { item: itemIndex } }];
	}

	const wait = this.getNodeParameter('waitForCompletion', itemIndex, true) as boolean;
	if (!wait) {
		return [{ json: response, pairedItem: { item: itemIndex } }];
	}
	const timeout = typeof options.timeout === 'number' ? options.timeout : 600;
	const job = await waitForJob.call(this, String(response.job_id), timeout, itemIndex, 5);
	const result = isDataObject(job.result) ? job.result : {};
	return [
		{
			json: { text: documentText(result), ...result, job_id: job.job_id },
			pairedItem: { item: itemIndex },
		},
	];
}

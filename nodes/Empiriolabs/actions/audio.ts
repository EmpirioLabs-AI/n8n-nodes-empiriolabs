import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	apiRequest,
	apiRequestRaw,
	binaryFieldName,
	buildMultipartBody,
	extensionForMimeType,
	extractMediaReferences,
	fileExtension,
	formFieldValue,
	isDataObject,
	isJobEnvelope,
	mimeTypeForAudioFormat,
	parseJson,
	parseJsonObjectParameter,
	resolveMediaReference,
	waitForJob,
} from '../transport';
import type { MediaFile } from '../transport';

function firstDataEntry(payload: IDataObject): IDataObject {
	const data = payload.data;
	if (Array.isArray(data) && isDataObject(data[0])) {
		return data[0];
	}
	return {};
}

export function buildSpeechBody(this: IExecuteFunctions, itemIndex: number): IDataObject {
	const model = this.getNodeParameter('model', itemIndex) as string;
	const text = this.getNodeParameter('text', itemIndex) as string;
	const voice = this.getNodeParameter('voice', itemIndex, '') as string;
	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;

	const optional: IDataObject = {};
	if (voice) {
		optional.voice = voice;
	}
	if (typeof options.language === 'string' && options.language !== '') {
		optional.language = options.language;
	}
	if (typeof options.outputFormat === 'string' && options.outputFormat !== '') {
		optional.output_format = options.outputFormat;
	}
	const extra = parseJsonObjectParameter.call(
		this,
		options.modelParameters,
		'Model Parameters (JSON)',
		itemIndex,
	);
	return { ...optional, ...extra, model, input: text };
}

export async function textToSpeech(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;
	const body = buildSpeechBody.call(this, itemIndex);

	// The endpoint answers with audio bytes or with JSON that links to the audio file.
	const response = await apiRequestRaw.call(this, 'POST', '/audio/speech', body, itemIndex);
	const looksLikeJson =
		response.contentType.includes('json') ||
		(response.contentType === '' && response.data.subarray(0, 1).toString() === '{');

	let file: MediaFile;
	const json: IDataObject = { model: body.model };
	if (looksLikeJson) {
		let payload = parseJson(response.data.toString('utf8'));
		if (!isDataObject(payload)) {
			throw new NodeOperationError(this.getNode(), 'The audio response could not be read', {
				itemIndex,
				description: 'Try again, or try a different model',
			});
		}
		if (isJobEnvelope(payload)) {
			const timeout = typeof options.timeout === 'number' ? options.timeout : 300;
			const job = await waitForJob.call(this, String(payload.job_id), timeout, itemIndex, 5);
			payload = isDataObject(job.result) ? job.result : job;
		}
		const payloadObject = payload as IDataObject;
		const reference = extractMediaReferences(payloadObject)[0];
		if (!reference) {
			throw new NodeOperationError(this.getNode(), 'The response did not include any audio', {
				itemIndex,
				description: 'Try again, or try a different voice or model',
			});
		}
		file = await resolveMediaReference.call(this, reference, itemIndex);
		const entry = firstDataEntry(payloadObject);
		if (payloadObject.model) {
			json.model = payloadObject.model;
		}
		json.url = reference.url ?? null;
		if (entry.format !== undefined) {
			json.format = entry.format;
		}
		const duration = entry.duration_seconds ?? entry.duration;
		if (duration !== undefined) {
			json.duration = duration;
		}
		if (!file.mimeType || file.mimeType === 'application/octet-stream') {
			file.mimeType = mimeTypeForAudioFormat(entry.format) ?? file.mimeType;
		}
	} else {
		file = { data: response.data, mimeType: response.contentType.split(';')[0].trim() };
	}

	const mimeType = file.mimeType || mimeTypeForAudioFormat(body.output_format) || 'audio/mpeg';
	const fileName = `speech.${fileExtension(file, mimeType, 'mp3')}`;
	const binary = await this.helpers.prepareBinaryData(file.data, fileName, mimeType);

	return [
		{
			json,
			binary: { [binaryFieldName(options)]: binary },
			pairedItem: { item: itemIndex },
		},
	];
}

export function simplifyTranscript(result: IDataObject, jobId?: unknown): IDataObject {
	const simplified: IDataObject = { text: result.text ?? '' };
	if (result.language !== undefined) {
		simplified.language = result.language;
	}
	if (result.duration !== undefined) {
		simplified.duration = result.duration;
	}
	if (jobId !== undefined) {
		simplified.job_id = jobId;
	}
	return simplified;
}

export async function transcribe(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const model = this.getNodeParameter('model', itemIndex) as string;
	const inputSource = this.getNodeParameter('inputSource', itemIndex, 'binaryData') as string;
	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;

	const optional: IDataObject = {};
	if (typeof options.language === 'string' && options.language !== '') {
		optional.language = options.language;
	}
	const extra = parseJsonObjectParameter.call(
		this,
		options.modelParameters,
		'Model Parameters (JSON)',
		itemIndex,
	);

	let response: IDataObject;
	if (inputSource === 'url') {
		const fileUrl = (this.getNodeParameter('fileUrl', itemIndex) as string).trim();
		response = await apiRequest.call(this, 'POST', '/audio/transcriptions', {
			...optional,
			...extra,
			model,
			file_url: fileUrl,
		});
	} else {
		const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex) as string;
		const binaryData = this.helpers.assertBinaryData(itemIndex, binaryPropertyName);
		const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);

		const fields: Record<string, string> = {};
		for (const [key, value] of Object.entries({ ...optional, ...extra })) {
			if (value !== undefined && value !== null) {
				fields[key] = formFieldValue(value);
			}
		}
		fields.model = model;

		const extension =
			binaryData.fileExtension ?? extensionForMimeType(binaryData.mimeType) ?? 'bin';
		const multipart = buildMultipartBody(fields, {
			fieldName: 'file',
			fileName: binaryData.fileName ?? `audio.${extension}`,
			mimeType: binaryData.mimeType || 'application/octet-stream',
			data: buffer,
		});
		response = await apiRequest.call(
			this,
			'POST',
			'/audio/transcriptions',
			multipart.body,
			undefined,
			{ headers: { 'Content-Type': multipart.contentType } },
		);
	}

	const simplify = this.getNodeParameter('simplify', itemIndex, true) as boolean;
	if (!isJobEnvelope(response)) {
		return [
			{
				json: simplify ? simplifyTranscript(response) : response,
				pairedItem: { item: itemIndex },
			},
		];
	}

	const wait = this.getNodeParameter('waitForTranscript', itemIndex, true) as boolean;
	if (!wait) {
		return [{ json: response, pairedItem: { item: itemIndex } }];
	}

	const timeout = typeof options.timeout === 'number' ? options.timeout : 600;
	const job = await waitForJob.call(this, String(response.job_id), timeout, itemIndex, 5);
	const result = isDataObject(job.result) ? job.result : {};
	return [
		{
			json: simplify ? simplifyTranscript(result, job.job_id) : job,
			pairedItem: { item: itemIndex },
		},
	];
}

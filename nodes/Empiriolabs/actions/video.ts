import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	apiRequest,
	binaryFieldName,
	extractMediaReferences,
	fileExtension,
	isDataObject,
	parseJsonObjectParameter,
	resolveMediaReference,
	waitForJob,
} from '../transport';

export function buildVideoBody(this: IExecuteFunctions, itemIndex: number): IDataObject {
	const model = this.getNodeParameter('model', itemIndex) as string;
	const prompt = this.getNodeParameter('prompt', itemIndex) as string;
	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;

	const optional: IDataObject = {};
	if (typeof options.aspectRatio === 'string' && options.aspectRatio !== '') {
		optional.aspect_ratio = options.aspectRatio;
	}
	if (typeof options.resolution === 'string' && options.resolution !== '') {
		optional.resolution = options.resolution;
	}
	if (typeof options.duration === 'number') {
		optional.duration = options.duration;
	}
	if (typeof options.generateAudio === 'boolean') {
		optional.generate_audio = options.generateAudio;
	}
	if (typeof options.imageUrl === 'string' && options.imageUrl.trim() !== '') {
		optional.image = options.imageUrl.trim();
	}
	const extra = parseJsonObjectParameter.call(
		this,
		options.modelParameters,
		'Model Parameters (JSON)',
		itemIndex,
	);
	return { ...optional, ...extra, model, prompt };
}

export async function generateVideo(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;
	const body = buildVideoBody.call(this, itemIndex);
	const started = await apiRequest.call(this, 'POST', '/videos/generations', body);

	const wait = this.getNodeParameter('waitForCompletion', itemIndex, false) as boolean;
	if (!wait) {
		return [{ json: started, pairedItem: { item: itemIndex } }];
	}

	let job: IDataObject;
	if (typeof started.job_id === 'string' && started.job_id !== '') {
		const timeout = this.getNodeParameter('timeout', itemIndex, 900) as number;
		job = await waitForJob.call(this, started.job_id, timeout, itemIndex, 10);
	} else if (extractMediaReferences(started).length > 0) {
		job = started;
	} else {
		throw new NodeOperationError(this.getNode(), 'The response did not include a job ID', {
			itemIndex,
			description: 'Try again, or turn off Wait for Completion to see the full response',
		});
	}

	const download = this.getNodeParameter('downloadVideo', itemIndex, true) as boolean;
	if (!download) {
		return [{ json: job, pairedItem: { item: itemIndex } }];
	}

	const reference = extractMediaReferences(isDataObject(job.result) ? job.result : job)[0];
	if (!reference) {
		throw new NodeOperationError(this.getNode(), 'The finished job did not include a video file', {
			itemIndex,
			description: 'Turn off Download Video to return the job result as JSON',
		});
	}
	const file = await resolveMediaReference.call(this, reference, itemIndex);
	const mimeType = file.mimeType || 'video/mp4';
	const fileName = `video.${fileExtension(file, mimeType, 'mp4')}`;
	const binary = await this.helpers.prepareBinaryData(file.data, fileName, mimeType);

	return [
		{
			json: job,
			binary: { [binaryFieldName(options)]: binary },
			pairedItem: { item: itemIndex },
		},
	];
}

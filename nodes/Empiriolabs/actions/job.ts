import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	apiRequest,
	binaryFieldName,
	extensionForMimeType,
	extractMediaReferences,
	isDataObject,
	normalizeJobStatus,
	resolveMediaReference,
} from '../transport';

export function readJobId(value: unknown): string {
	if (isDataObject(value)) {
		return String(value.value ?? '').trim();
	}
	return typeof value === 'string' ? value.trim() : '';
}

export async function getJob(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const jobId = readJobId(this.getNodeParameter('jobId', itemIndex, '', { extractValue: true }));
	if (jobId === '') {
		throw new NodeOperationError(this.getNode(), 'Select a job or enter a job ID', {
			itemIndex,
			description: 'Job IDs are returned when a job starts, for example by the Video resource',
		});
	}
	const job = await apiRequest.call(this, 'GET', `/jobs/${encodeURIComponent(jobId)}`);

	const download = this.getNodeParameter('downloadOutput', itemIndex, false) as boolean;
	if (!download) {
		return [{ json: job, pairedItem: { item: itemIndex } }];
	}

	const status = normalizeJobStatus(job.status);
	if (status !== 'completed') {
		throw new NodeOperationError(
			this.getNode(),
			`Job ${jobId} has status "${status}", so there is no file to download yet`,
			{
				itemIndex,
				description: 'Run the node again after the job completes, or turn off Download Output',
			},
		);
	}

	const reference = extractMediaReferences(isDataObject(job.result) ? job.result : job)[0];
	if (!reference) {
		throw new NodeOperationError(this.getNode(), 'The job result does not include a file', {
			itemIndex,
			description: 'Turn off Download Output to return the job result as JSON',
		});
	}

	const file = await resolveMediaReference.call(this, reference, itemIndex);
	const mimeType = file.mimeType || 'application/octet-stream';
	const fileName = file.fileName ?? `${jobId}.${extensionForMimeType(mimeType) ?? 'bin'}`;
	const binary = await this.helpers.prepareBinaryData(file.data, fileName, mimeType);
	const options: IDataObject = {
		binaryPropertyOutput: this.getNodeParameter('binaryPropertyOutput', itemIndex, 'data'),
	};

	return [
		{
			json: job,
			binary: { [binaryFieldName(options)]: binary },
			pairedItem: { item: itemIndex },
		},
	];
}

export async function getManyJobs(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	const returnAll = this.getNodeParameter('returnAll', itemIndex, false) as boolean;
	// The API returns at most 100 jobs from the last hour.
	const limit = returnAll ? 100 : (this.getNodeParameter('limit', itemIndex, 50) as number);
	const filters = this.getNodeParameter('filters', itemIndex, {}) as IDataObject;

	const qs: IDataObject = { limit };
	if (typeof filters.status === 'string' && filters.status !== '') {
		qs.status = filters.status;
	}

	const response = await apiRequest.call(this, 'GET', '/jobs', undefined, qs);
	const jobs = Array.isArray(response.data)
		? (response.data as unknown[]).filter(isDataObject)
		: [];

	return jobs.slice(0, limit).map((job) => ({ json: job, pairedItem: { item: itemIndex } }));
}

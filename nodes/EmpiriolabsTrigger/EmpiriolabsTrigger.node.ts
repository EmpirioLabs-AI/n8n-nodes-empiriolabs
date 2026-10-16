import type {
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IPollFunctions,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

import { apiRequest, isDataObject, normalizeJobStatus } from '../Empiriolabs/transport';

/** Strips the version prefix so "/v1/videos/generations" and "/videos/generations" compare equal. */
export function normalizeEndpoint(endpoint: unknown): string {
	return String(endpoint ?? '')
		.trim()
		.replace(/^\/?v\d+(?=\/)/i, '')
		.replace(/\/+$/, '')
		.toLowerCase();
}

export function finishedJobs(
	jobs: IDataObject[],
	statuses: string[],
	filters: IDataObject,
): IDataObject[] {
	const wantedEndpoint =
		typeof filters.endpoint === 'string' && filters.endpoint !== ''
			? normalizeEndpoint(filters.endpoint)
			: '';
	const wantedModel =
		typeof filters.model === 'string' && filters.model.trim() !== '' ? filters.model.trim() : '';

	return jobs.filter((job) => {
		if (typeof job.job_id !== 'string' || job.job_id === '') {
			return false;
		}
		if (!statuses.includes(normalizeJobStatus(job.status))) {
			return false;
		}
		if (wantedEndpoint && normalizeEndpoint(job.endpoint) !== wantedEndpoint) {
			return false;
		}
		if (wantedModel && job.model !== wantedModel) {
			return false;
		}
		return true;
	});
}

/**
 * Returns the jobs that have not been emitted before, oldest first, and the ids to remember.
 * The jobs list only covers recent jobs, so only ids still in the list need to be kept.
 */
export function selectNewJobs(
	finished: IDataObject[],
	seenJobIds: string[],
): { newJobs: IDataObject[]; seenJobIds: string[] } {
	const seen = new Set(seenJobIds);
	const newJobs = finished.filter((job) => !seen.has(String(job.job_id))).reverse();
	return { newJobs, seenJobIds: finished.map((job) => String(job.job_id)) };
}

export class EmpiriolabsTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'EmpirioLabs AI Trigger',
		name: 'empiriolabsTrigger',
		icon: { light: 'file:../../icons/empiriolabs.png', dark: 'file:../../icons/empiriolabs.png' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{ "Job finished" }}',
		description: 'Starts the workflow when an EmpirioLabs AI job finishes',
		defaults: {
			name: 'EmpirioLabs AI Trigger',
		},
		credentials: [
			{
				name: 'empirioLabsApi',
				required: true,
			},
		],
		polling: true,
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		properties: [
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Job Finished',
						value: 'jobFinished',
						description: 'An image, video, audio, or transcription job reached a final status',
					},
				],
				default: 'jobFinished',
			},
			{
				displayName: 'Statuses',
				name: 'statuses',
				type: 'multiOptions',
				options: [
					{ name: 'Cancelled', value: 'cancelled' },
					{ name: 'Completed', value: 'completed' },
					{ name: 'Failed', value: 'failed' },
				],
				default: ['completed', 'failed'],
				description: 'The final statuses that start the workflow',
			},
			{
				displayName: 'Filters',
				name: 'filters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				options: [
					{
						displayName: 'Job Type',
						name: 'endpoint',
						type: 'options',
						options: [
							{ name: '3D Generation', value: '/v1/3d/generations' },
							{ name: 'Image Generation', value: '/v1/images/generations' },
							{ name: 'Music and Sound Generation', value: '/v1/audio/generations' },
							{ name: 'Speech Generation', value: '/v1/audio/speech' },
							{ name: 'Transcription', value: '/v1/audio/transcriptions' },
							{ name: 'Video Generation', value: '/v1/videos/generations' },
						],
						default: '/v1/videos/generations',
						description: 'Only start the workflow for jobs of this type',
					},
					{
						displayName: 'Model ID',
						name: 'model',
						type: 'string',
						default: '',
						placeholder: 'e.g. kling-3-0-turbo',
						description: 'Only start the workflow for jobs that used this model',
					},
				],
			},
			{
				displayName:
					'The jobs list covers jobs from the last hour, so keep the poll interval under an hour',
				name: 'notice',
				type: 'notice',
				default: '',
			},
		],
	};

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const statuses = this.getNodeParameter('statuses', []) as string[];
		const filters = this.getNodeParameter('filters', {}) as IDataObject;

		const response = await apiRequest.call(this, 'GET', '/jobs', undefined, { limit: 100 });
		const jobs = Array.isArray(response.data)
			? (response.data as unknown[]).filter(isDataObject)
			: [];
		const finished = finishedJobs(jobs, statuses, filters);

		if (this.getMode() === 'manual') {
			return finished.length > 0 ? [this.helpers.returnJsonArray([finished[0]])] : null;
		}

		const staticData = this.getWorkflowStaticData('node');
		if (!Array.isArray(staticData.seenJobIds)) {
			// First poll after activation: remember what already finished without emitting it.
			staticData.seenJobIds = finished.map((job) => String(job.job_id));
			return null;
		}

		const { newJobs, seenJobIds } = selectNewJobs(finished, staticData.seenJobIds as string[]);
		staticData.seenJobIds = seenJobIds;

		return newJobs.length > 0 ? [this.helpers.returnJsonArray(newJobs)] : null;
	}
}

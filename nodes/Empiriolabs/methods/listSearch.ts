import type { IDataObject, ILoadOptionsFunctions, INodeListSearchResult } from 'n8n-workflow';

import { apiRequest, isDataObject, normalizeJobStatus } from '../transport';

/** Formats a job timestamp given as ISO text or as Unix seconds, for example "2026-10-16 10:00:00 UTC". */
export function formatJobTime(value: unknown): string | undefined {
	let date: Date | undefined;
	if (typeof value === 'number' && Number.isFinite(value)) {
		date = new Date(value < 1e12 ? value * 1000 : value);
	} else if (typeof value === 'string' && value !== '') {
		date = new Date(/^\d+(\.\d+)?$/.test(value) ? Number(value) * 1000 : value);
	}
	if (!date || Number.isNaN(date.getTime())) {
		return undefined;
	}
	return `${date.toISOString().slice(0, 19).replace('T', ' ')} UTC`;
}

export function describeJob(job: IDataObject): string {
	const parts: string[] = [];
	if (typeof job.model === 'string' && job.model) {
		parts.push(job.model);
	}
	const status = normalizeJobStatus(job.status);
	if (status) {
		parts.push(status);
	}
	const created = formatJobTime(job.created_at);
	if (created) {
		parts.push(created);
	}
	return parts.length > 0 ? `${parts.join(', ')} (${String(job.job_id)})` : String(job.job_id);
}

/**
 * Lists the account's jobs from the last hour, newest first, for the Job picker.
 */
export async function searchJobs(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const response = await apiRequest.call(this, 'GET', '/jobs', undefined, { limit: 100 });
	const jobs = Array.isArray(response.data)
		? (response.data as unknown[]).filter(isDataObject)
		: [];
	const needle = (filter ?? '').trim().toLowerCase();

	const results = jobs
		.filter((job) => typeof job.job_id === 'string' && job.job_id !== '')
		.map((job) => ({ name: describeJob(job), value: String(job.job_id) }))
		.filter((result) => needle === '' || result.name.toLowerCase().includes(needle));

	return { results };
}

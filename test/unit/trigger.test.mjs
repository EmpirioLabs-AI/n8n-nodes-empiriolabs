import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createPollContext, loadDist } from '../helpers/context.mjs';

const triggerModule = loadDist('nodes/EmpiriolabsTrigger/EmpiriolabsTrigger.node.js');
const trigger = new triggerModule.EmpiriolabsTrigger();

const parameters = { statuses: ['completed', 'failed'], filters: {} };

function jobs(...entries) {
	return {
		data: entries.map(
			([job_id, status, endpoint = '/v1/videos/generations', model = 'reel-video']) => ({
				job_id,
				status,
				endpoint,
				model,
				created_at: '2026-10-16T10:00:00Z',
			}),
		),
	};
}

describe('trigger description', () => {
	it('is a polling trigger with no inputs and is not offered as a tool', () => {
		const { description } = trigger;
		assert.equal(description.name, 'empiriolabsTrigger');
		assert.equal(description.displayName, 'EmpirioLabs AI Trigger');
		assert.equal(description.polling, true);
		assert.deepEqual(description.inputs, []);
		assert.equal(description.usableAsTool, undefined);
	});
});

describe('job finished polling', () => {
	it('remembers existing jobs on activation, then emits only new finished jobs once', async () => {
		let response = jobs(['job_old', 'completed'], ['job_run', 'processing']);
		const context = createPollContext({ parameters, respond: () => response });

		assert.equal(await trigger.poll.call(context), null);
		assert.deepEqual(context.staticData.seenJobIds, ['job_old']);
		assert.deepEqual(context.calls[0].qs, { limit: 100 });
		assert.equal(context.calls[0].url, '/jobs');

		// Newest first from the API: job_new finished, job_run finished, job_old already seen.
		response = jobs(['job_new', 'succeeded'], ['job_run', 'failed'], ['job_old', 'completed']);
		const [emitted] = await trigger.poll.call(context);
		assert.deepEqual(
			emitted.map((item) => item.json.job_id),
			['job_run', 'job_new'],
		);

		// Polling again without changes emits nothing.
		assert.equal(await trigger.poll.call(context), null);

		// Jobs that left the one-hour list are forgotten.
		response = jobs(['job_new', 'completed']);
		assert.equal(await trigger.poll.call(context), null);
		assert.deepEqual(context.staticData.seenJobIds, ['job_new']);
	});

	it('applies the status, job type, and model filters', () => {
		const list = jobs(
			['a', 'completed', '/v1/videos/generations', 'reel-video'],
			['b', 'cancelled', '/v1/videos/generations', 'reel-video'],
			['c', 'completed', '/v1/images/generations', 'pixel-image'],
			['d', 'completed', '/videos/generations', 'other-video'],
		).data;
		const finished = triggerModule.finishedJobs(list, ['completed'], {
			endpoint: '/v1/videos/generations',
			model: 'reel-video',
		});
		assert.deepEqual(
			finished.map((job) => job.job_id),
			['a'],
		);
		assert.equal(triggerModule.normalizeEndpoint('/v1/videos/generations/'), '/videos/generations');
	});

	it('returns the latest finished job when tested manually', async () => {
		const context = createPollContext({
			parameters,
			mode: 'manual',
			respond: () => jobs(['job_2', 'completed'], ['job_1', 'completed']),
		});
		const [items] = await trigger.poll.call(context);
		assert.deepEqual(
			items.map((item) => item.json.job_id),
			['job_2'],
		);
		assert.deepEqual(context.staticData, {});
	});
});

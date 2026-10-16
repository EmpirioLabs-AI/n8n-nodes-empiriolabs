import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadDist } from '../helpers/context.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

function walk(directory) {
	return readdirSync(directory).flatMap((entry) => {
		const full = path.join(directory, entry);
		return statSync(full).isDirectory() ? walk(full) : [full];
	});
}

describe('package', () => {
	it('meets the community package requirements', () => {
		assert.equal(pkg.name, 'n8n-nodes-empiriolabs');
		assert.equal(pkg.license, 'MIT');
		assert.ok(pkg.keywords.includes('n8n-community-node-package'));
		assert.equal(pkg.dependencies, undefined, 'no runtime dependencies');
		assert.deepEqual(pkg.peerDependencies, { 'n8n-workflow': '*' });
		assert.deepEqual(pkg.files, ['dist']);
		assert.equal(
			pkg.repository.url,
			'git+https://github.com/EmpirioLabs-AI/n8n-nodes-empiriolabs.git',
		);
		for (const entry of [...pkg.n8n.nodes, ...pkg.n8n.credentials]) {
			assert.ok(existsSync(path.join(root, entry)), `${entry} is built`);
		}
	});

	it('ships the official icon unchanged', () => {
		const icon = readFileSync(path.join(root, 'icons', 'empiriolabs.png'));
		assert.equal(icon.subarray(1, 4).toString(), 'PNG');
		assert.ok(existsSync(path.join(root, 'dist', 'icons', 'empiriolabs.png')));
	});

	it('keeps user-facing files free of em dashes', () => {
		const files = [
			...walk(path.join(root, 'nodes')),
			...walk(path.join(root, 'credentials')),
			path.join(root, 'README.md'),
			path.join(root, 'package.json'),
		].filter((file) => /\.(ts|json|md)$/.test(file));
		for (const file of files) {
			assert.ok(
				!readFileSync(file, 'utf8').includes(String.fromCharCode(0x2014)),
				`${path.relative(root, file)} has an em dash`,
			);
		}
	});
});

describe('credential', () => {
	const { EmpirioLabsApi } = loadDist('credentials/EmpirioLabsApi.credentials.js');
	const credential = new EmpirioLabsApi();

	it('sends the API key as a bearer token', () => {
		assert.equal(credential.name, 'empirioLabsApi');
		assert.equal(credential.displayName, 'EmpirioLabs AI API');
		assert.deepEqual(credential.authenticate, {
			type: 'generic',
			properties: { headers: { Authorization: '=Bearer {{$credentials.apiKey}}' } },
		});
		const [apiKey] = credential.properties;
		assert.equal(apiKey.name, 'apiKey');
		assert.equal(apiKey.typeOptions.password, true);
	});

	it('tests the key against the account usage endpoint', () => {
		assert.deepEqual(credential.test.request, {
			baseURL: 'https://api.empiriolabs.ai/v1',
			url: '/account/usage',
			method: 'GET',
			qs: { limit: 1 },
		});
	});
});

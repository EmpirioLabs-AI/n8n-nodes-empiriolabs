import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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

/** The paths npm would put in the published package, from a dry run of `npm pack`. */
function publishedFiles() {
	const args = ['pack', '--dry-run', '--json', '--ignore-scripts'];
	// npm_execpath points at npm's own CLI when the tests run through `npm test`.
	const npmCli = process.env.npm_execpath;
	const output =
		npmCli && npmCli.endsWith('.js')
			? execFileSync(process.execPath, [npmCli, ...args], { cwd: root, encoding: 'utf8' })
			: execFileSync('npm', args, {
					cwd: root,
					encoding: 'utf8',
					shell: process.platform === 'win32',
				});
	return JSON.parse(output)[0].files.map((file) => file.path);
}

describe('package', () => {
	it('meets the community package requirements', () => {
		assert.equal(pkg.name, 'n8n-nodes-empiriolabs');
		assert.equal(pkg.license, 'MIT');
		assert.ok(pkg.keywords.includes('n8n-community-node-package'));
		assert.equal(pkg.dependencies, undefined, 'no runtime dependencies');
		assert.deepEqual(pkg.peerDependencies, { 'n8n-workflow': '*' });
		assert.deepEqual(pkg.files, ['dist', '!dist/docs', '!dist/test']);
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

	it('publishes the built nodes and the icon, and no other image', () => {
		const files = publishedFiles();
		for (const entry of [...pkg.n8n.nodes, ...pkg.n8n.credentials]) {
			assert.ok(files.includes(entry), `${entry} is published`);
		}
		// The build copies every image of the repository into dist: only the icon is published.
		assert.deepEqual(
			files.filter((file) => /\.(png|svg|jpe?g|gif|webp)$/i.test(file)),
			['dist/icons/empiriolabs.png'],
		);
		assert.deepEqual(
			files.filter((file) => !/^(dist\/|package\.json$|README\.md$|LICENSE\.md$)/.test(file)),
			[],
		);
		assert.deepEqual(
			files.filter((file) => /^dist\/(?!credentials\/|icons\/|nodes\/)[^/]+\//.test(file)),
			[],
		);
	});

	it('describes its version in the changelog and the README', () => {
		assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
		const lines = (file) => readFileSync(path.join(root, file), 'utf8').split(/\r?\n/);
		const changelogVersions = lines('CHANGELOG.md').filter((line) => line.startsWith('## '));
		assert.equal(changelogVersions[0], `## ${pkg.version}`, 'the changelog opens with it');
		assert.ok(
			lines('README.md').includes(`### ${pkg.version}`),
			'the README version history has it',
		);
	});

	it('keeps user-facing files free of em dashes', () => {
		const files = [
			...walk(path.join(root, 'nodes')),
			...walk(path.join(root, 'credentials')),
			path.join(root, 'README.md'),
			path.join(root, 'CHANGELOG.md'),
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

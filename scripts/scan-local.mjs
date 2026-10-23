// Runs the static analysis of `npx @n8n/scan-community-package` against this
// checkout before anything is published.
//
// The published scan does three things: it checks the npm provenance of the
// version, lints the source at the commit the provenance points to, and lints
// the published tarball. Provenance only exists once GitHub Actions publishes a
// version, so this script runs the two lint passes locally:
//   1. the source files (package.json, nodes/, credentials/), and
//   2. the files `npm pack` would publish (compiled .js and package.json).
//
// Usage: npm run scan:local (builds first; installs the locked scanner into .scan/tool).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SCANNER, SCANNER_MANIFEST } from './scanner-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workDir = path.join(root, '.scan');
const toolDir = path.join(workDir, 'tool');
const packDir = path.join(workDir, 'package');

function npm(args, cwd) {
	// npm_execpath points at npm's own CLI when this runs through `npm run`.
	const npmCli = process.env.npm_execpath;
	if (npmCli && npmCli.endsWith('.js')) {
		return execFileSync(process.execPath, [npmCli, ...args], { cwd, encoding: 'utf8' });
	}
	return execFileSync('npm', args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' });
}

function lockedVersion(name) {
	const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
	const version = lock.packages?.[`node_modules/${name}`]?.version;
	if (!version) {
		throw new Error(`package-lock.json does not resolve ${name}`);
	}
	return version;
}

function installedVersion(name) {
	const manifest = path.join(toolDir, 'node_modules', ...name.split('/'), 'package.json');
	return existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8')).version : undefined;
}

function ensureScanner() {
	const projectManifest = path.join(root, 'node_modules', 'n8n-workflow', 'package.json');
	if (
		!existsSync(projectManifest) ||
		JSON.parse(readFileSync(projectManifest, 'utf8')).version !== lockedVersion('n8n-workflow')
	) {
		throw new Error('n8n-workflow does not match package-lock.json; run npm ci --ignore-scripts');
	}
	const lockBytes = readFileSync(path.join(root, 'scripts', 'scanner-package-lock.json'));
	const lock = JSON.parse(lockBytes.toString('utf8'));
	if (Object.keys(lock.packages ?? {}).some((name) => name.endsWith('/n8n-workflow'))) {
		throw new Error('The scanner lock must inherit the project n8n-workflow peer');
	}
	const version = lock.packages?.[`node_modules/${SCANNER}`]?.version;
	if (!version || !lock.packages?.['']?.dependencies?.[SCANNER]) {
		throw new Error('The scanner lock does not resolve the scanner');
	}
	const stamp = path.join(toolDir, '.lock-sha256');
	const digest = createHash('sha256')
		.update(JSON.stringify(SCANNER_MANIFEST))
		.update(lockBytes)
		.digest('hex');
	if (
		existsSync(stamp) &&
		readFileSync(stamp, 'utf8') === digest &&
		installedVersion(SCANNER) === version
	) {
		return;
	}
	mkdirSync(toolDir, { recursive: true });
	writeFileSync(path.join(toolDir, 'package.json'), JSON.stringify(SCANNER_MANIFEST, null, 2));
	writeFileSync(path.join(toolDir, 'package-lock.json'), lockBytes);
	console.log(`Installing locked ${SCANNER}@${version} into .scan/tool ...`);
	// Omitting automatic peer installs lets the scanner resolve the project's own
	// n8n-workflow, rather than maintaining another copy or consulting a dist-tag.
	npm(['ci', '--no-audit', '--no-fund', '--ignore-scripts', '--legacy-peer-deps'], toolDir);
	writeFileSync(stamp, digest);
}

function stagePublishedFiles() {
	rmSync(packDir, { recursive: true, force: true });
	mkdirSync(packDir, { recursive: true });
	const [pack] = JSON.parse(npm(['pack', '--dry-run', '--json', '--ignore-scripts'], root));
	for (const file of pack.files) {
		const target = path.join(packDir, file.path);
		mkdirSync(path.dirname(target), { recursive: true });
		cpSync(path.join(root, file.path), target);
	}
	return pack;
}

function report(label, result) {
	if (result.passed) {
		console.log(`PASS  ${label}${result.message ? ` (${result.message})` : ''}`);
		return true;
	}
	console.log(`FAIL  ${label}: ${result.message}`);
	if (result.details) {
		console.log(result.details);
	}
	return false;
}

ensureScanner();
const projectRequire = createRequire(import.meta.url);
const scannerRequire = createRequire(path.join(toolDir, 'package.json'));
if (scannerRequire.resolve('n8n-workflow') !== projectRequire.resolve('n8n-workflow')) {
	throw new Error('The scanner must resolve the same n8n-workflow installation as this project');
}
const pack = stagePublishedFiles();
console.log(`Staged ${pack.files.length} files from ${pack.filename} (${pack.size} bytes packed)`);

const scanner = await import(
	pathToFileURL(path.join(toolDir, 'node_modules', ...SCANNER.split('/'), 'scanner', 'scanner.mjs'))
		.href
);

const sourceOk = report(
	'source lint (package.json, nodes/, credentials/)',
	await scanner.analyzePackage(root, scanner.SOURCE_FILE_PATTERNS),
);
const distOk = report(
	'published files lint (compiled .js, package.json)',
	await scanner.analyzePackage(packDir, ['**/*.js', 'package.json']),
);
console.log(
	'SKIP  npm provenance (checked by the published scan after GitHub Actions publishes a version)',
);

rmSync(packDir, { recursive: true, force: true });
process.exitCode = sourceOk && distOk ? 0 : 1;

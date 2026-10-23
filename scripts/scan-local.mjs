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
// Usage: npm run scan:local   (builds first; installs the scanner into .scan/tool)
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCANNER = '@n8n/scan-community-package';
const SCANNER_VERSION = '0.40.0';

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
	// The scanner's lint plugin loads n8n-workflow, a peer it declares as `>=2`, so npm would
	// install whatever the registry's `latest` tag names. Install the version this project's
	// lockfile resolves instead: the scan then loads what `npm run lint` loads, and it moves
	// with every lockfile update.
	const wanted = [
		[SCANNER, SCANNER_VERSION],
		['n8n-workflow', lockedVersion('n8n-workflow')],
	];
	if (wanted.every(([name, version]) => installedVersion(name) === version)) {
		return;
	}
	rmSync(toolDir, { recursive: true, force: true });
	mkdirSync(toolDir, { recursive: true });
	writeFileSync(
		path.join(toolDir, 'package.json'),
		JSON.stringify({ name: 'local-scan-tool', private: true }, null, 2),
	);
	const specs = wanted.map(([name, version]) => `${name}@${version}`);
	console.log(`Installing ${specs.join(' ')} into .scan/tool ...`);
	// The scanner runs without any install script, so none are run.
	npm(['install', '--no-audit', '--no-fund', '--ignore-scripts', ...specs], toolDir);
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

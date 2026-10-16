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
const SCANNER_VERSION = '0.39.0';

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

function ensureScanner() {
	const manifest = path.join(toolDir, 'node_modules', ...SCANNER.split('/'), 'package.json');
	if (
		existsSync(manifest) &&
		JSON.parse(readFileSync(manifest, 'utf8')).version === SCANNER_VERSION
	) {
		return;
	}
	mkdirSync(toolDir, { recursive: true });
	writeFileSync(
		path.join(toolDir, 'package.json'),
		JSON.stringify({ name: 'local-scan-tool', private: true }, null, 2),
	);
	console.log(`Installing ${SCANNER}@${SCANNER_VERSION} into .scan/tool ...`);
	npm(['install', '--no-audit', '--no-fund', `${SCANNER}@${SCANNER_VERSION}`], toolDir);
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

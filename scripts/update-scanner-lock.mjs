// Update the isolated scanner's one committed lock without adding a second
// package manifest to the source repository. Edit scanner-config.mjs, then run this script.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCANNER, SCANNER_MANIFEST } from './scanner-config.mjs';

const version = SCANNER_MANIFEST.dependencies[SCANNER];
if (!version || !/^\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?(?:\+[\da-zA-Z.-]+)?$/.test(version)) {
	throw new Error('scanner-config.mjs must pin an exact scanner version');
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(path.join(root, '.scan'), { recursive: true });
const directory = mkdtempSync(path.join(root, '.scan', 'lock-update-'));
writeFileSync(path.join(directory, 'package.json'), JSON.stringify(SCANNER_MANIFEST, null, 2));
const args = [
	'install',
	'--package-lock-only',
	'--ignore-scripts',
	'--legacy-peer-deps',
	'--no-audit',
	'--no-fund',
];
const npmCli = process.env.npm_execpath;
if (npmCli?.endsWith('.js')) {
	execFileSync(process.execPath, [npmCli, ...args], { cwd: directory, stdio: 'inherit' });
} else {
	execFileSync('npm', args, {
		cwd: directory,
		stdio: 'inherit',
		shell: process.platform === 'win32',
	});
}
const bytes = readFileSync(path.join(directory, 'package-lock.json'), 'utf8');
const lock = JSON.parse(bytes);
if (Object.keys(lock.packages ?? {}).some((name) => name.endsWith('/n8n-workflow'))) {
	throw new Error(
		'Scanner dependencies include a private n8n-workflow copy; review before updating',
	);
}
if (lock.packages?.['node_modules/@n8n/scan-community-package']?.version !== version) {
	throw new Error('The generated lock did not resolve the requested scanner version');
}
writeFileSync(
	path.join(root, 'scripts', 'scanner-package-lock.json'),
	bytes.replace(/\r\n/g, '\n'),
);
console.log('Updated scanner-package-lock.json; review the diff and run npm run scan:local.');

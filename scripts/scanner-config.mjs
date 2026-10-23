// Only the private audit tool uses these dependencies and overrides. They do not
// enter the published community-node package or change its runtime dependencies.
export const SCANNER = '@n8n/scan-community-package';
export const SCANNER_MANIFEST = {
	name: 'empiriolabs-n8n-scanner',
	version: '1.0.0',
	private: true,
	dependencies: { [SCANNER]: '0.40.0' },
	// The scanner pins 0.2.4; 0.2.7 includes the path-validation security fix.
	overrides: { tmp: '0.2.7' },
};

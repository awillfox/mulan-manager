import { defineConfig } from '@playwright/test';

export default defineConfig({
	// Only e2e specs live in e2e/. Vitest `*.spec.ts` files under src/ are NOT
	// Playwright tests — scoping testDir here keeps Playwright from trying to run them.
	testDir: 'e2e',
	webServer: { command: 'npm run dev', port: 5173, reuseExistingServer: true },
	use: { baseURL: 'http://localhost:5173' }
});

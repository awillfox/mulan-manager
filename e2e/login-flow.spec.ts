import { expect, test } from '@playwright/test';

const USER = process.env.E2E_USER ?? 'owner';
const PASS = process.env.E2E_PASS ?? 'changeme123';

test('redirects to login when unauthenticated', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveURL(/\/login/);
});

test('login → dashboard → discounts CRUD', async ({ page }) => {
	await page.goto('/login');
	await page.fill('input[name="username"]', USER);
	await page.fill('input[name="password"]', PASS);
	await page.click('button[type="submit"]');

	await expect(page).toHaveURL('/');
	await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

	// Navigate to discounts and wait for the client list fetch to resolve. This
	// also guarantees the page has hydrated before we interact (clicking before
	// hydration would be a no-op and the sheet would never open).
	// Discounts now lives under the "More" tab.
	await page.getByRole('link', { name: 'More' }).click();
	const listLoaded = page.waitForResponse(
		(r) =>
			r.url().includes('/api/discounts') &&
			!r.url().includes('/active') &&
			r.request().method() === 'GET'
	);
	await page.getByRole('link', { name: 'Discounts' }).click();
	await expect(page.getByRole('heading', { name: 'Discounts' })).toBeVisible();
	await listLoaded;

	const name = 'E2E ' + Date.now();
	await page.getByRole('button', { name: '＋ New' }).click();
	await expect(page.getByPlaceholder('e.g. Staff 10%')).toBeVisible();
	await page.getByPlaceholder('e.g. Staff 10%').fill(name);
	await page.getByPlaceholder('50.00').fill('25');
	await page.getByRole('button', { name: 'Save' }).click();

	await expect(page.getByText(name)).toBeVisible();

	// Sign out from More → Account returns to /login and clears the session.
	await page.getByRole('link', { name: 'More' }).click();
	await expect(page.getByRole('heading', { name: 'More' })).toBeVisible();
	await page.getByRole('button', { name: 'Sign Out' }).click();
	await expect(page).toHaveURL(/\/login/);
});

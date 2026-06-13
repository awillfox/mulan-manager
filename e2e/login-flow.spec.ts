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

	await page.getByRole('link', { name: 'Discounts' }).click();
	await expect(page.getByRole('heading', { name: 'Discounts' })).toBeVisible();

	const name = 'E2E ' + Date.now();
	await page.getByRole('button', { name: '＋ New' }).click();
	await page.getByPlaceholder('e.g. Staff 10%').fill(name);
	await page.getByPlaceholder('50.00').fill('25');
	await page.getByRole('button', { name: 'Save' }).click();

	await expect(page.getByText(name)).toBeVisible();
});

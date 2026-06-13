import { expect, test } from '@playwright/test';
const USER = process.env.E2E_USER ?? 'owner';
const PASS = process.env.E2E_PASS ?? 'changeme123';

test('owner creates a menu item', async ({ page }) => {
	await page.goto('/login');
	await page.fill('input[name="username"]', USER);
	await page.fill('input[name="password"]', PASS);
	await page.click('button[type="submit"]');
	await expect(page).toHaveURL('/');

	const loaded = page.waitForResponse(
		(r) => r.url().includes('/api/menus') && r.request().method() === 'GET'
	);
	await page.getByRole('link', { name: 'Menu' }).click();
	await expect(page.getByRole('heading', { name: 'Menu' })).toBeVisible();
	await loaded;

	const name = 'E2E Item ' + Date.now();
	await page.getByRole('button', { name: '＋', exact: true }).click();
	await expect(page.getByPlaceholder('e.g. Iced Coffee')).toBeVisible();
	await page.getByPlaceholder('e.g. Iced Coffee').fill(name);
	await page.getByPlaceholder('50.00').first().fill('45');
	await page.getByRole('button', { name: 'Save' }).click();

	await expect(page.getByText(name)).toBeVisible();
});

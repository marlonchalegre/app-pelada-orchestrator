import { test, expect } from '@playwright/test';
import { saveVideo } from './utils';

test.describe('Bug Reproduction: Players per team update crash', () => {
  const timestamp = Date.now();
  const admin = {
    name: `Admin ${timestamp}`,
    username: `admin_${timestamp}`,
    email: `admin_${timestamp}@fantasy.com`,
    password: '1234'
  };

  test('should not crash when updating players per team', async ({ browser }, testInfo) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const logs: string[] = [];
    page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', err => logs.push(`[ERROR] ${err.message}`));

    try {
      // 1. Register and login

      await page.goto('/register');
      await page.getByTestId('register-name').fill(admin.name);
      await page.getByTestId('register-username').fill(admin.username);
      await page.getByTestId('register-email').fill(admin.email);
      await page.getByTestId('register-password').fill(admin.password);
      await page.getByRole('button', { name: /Register|Cadastrar/i }).click();
      
      // Might auto-login or redirect to login
      await page.waitForTimeout(2000);
      if (page.url().endsWith('/login')) {
        await page.getByLabel(/Email/i).fill(admin.email);
        await page.getByLabel(/Password|Senha/i).fill(admin.password);
        await page.getByRole('button', { name: /Login|Entrar/i }).click();
      }
      await expect(page).toHaveURL('/');

      // 2. Create Organization
      await page.getByTestId('create-org-open-dialog').click();
      const orgName = `Bug Repro Org ${timestamp}`;
      await page.getByTestId('org-name-input').fill(orgName);
      await page.getByTestId('org-submit-button').click();
      
      // Wait for it to appear in the list and click it
      const orgLink = page.getByTestId(`org-link-${orgName}`);
      await orgLink.click();
      
      await expect(page).toHaveURL(/\/organizations\/\d+/);
      const orgUrlMatch = await page.url().match(/\/organizations\/(\d+)/);
      const orgId = orgUrlMatch ? orgUrlMatch[1] : null;
      expect(orgId).not.toBeNull();

      // 3. Create Pelada
      await page.getByTestId('create-pelada-submit').click();
      await expect(page).toHaveURL(/\/peladas\/\d+\/attendance/, { timeout: 20000 });
      await page.waitForLoadState('networkidle');
      
      // 4. Close Attendance
      await expect(page.getByText(/Weekly Match Attendance|Presença Semanal/i)).toBeVisible({ timeout: 20000 });
      
      const confirmBtn = page.getByTestId('attendance-confirm-button').or(page.getByTestId('attendance-card-confirm')).first();
      try {
        await expect(confirmBtn).toBeVisible({ timeout: 15000 });
      } catch (e) {
        console.log('Page URL:', page.url());
        console.log('Page content:', await page.content());
        throw e;
      }
      await confirmBtn.click();
      await page.getByTestId('close-attendance-button').click();
      
      const peladaUrlMatch = await page.url().match(/\/peladas\/(\d+)/);
      const peladaId = peladaUrlMatch ? peladaUrlMatch[1] : null;
      expect(peladaId).not.toBeNull();

      // 5. Interact with "Players per team" (Jogadores por time)
      const input = page.getByTestId('players-per-team-input').locator('input');
      await expect(input).toBeVisible();
      
      // Clear and type a new value
      await input.click();
      await input.fill('6');
      
      // If it crashes, the next assertion or action will fail or we can check for error alerts
      // Based on user report, it crashes the frontend. Usually this means an unhandled promise rejection
      // or a state update that fails.
      
      // Wait for any potential processing to finish
      await page.waitForTimeout(2000);
      
      // Check if an error message appeared on screen (assuming the app shows errors in an Alert)
      const errorAlert = page.locator('.MuiAlert-root');
      if (await errorAlert.isVisible()) {
        const text = await errorAlert.textContent();
        console.log('Error alert detected:', text);
        expect(text).not.toContain('key-map may not be empty');
      }

      // If it didn't crash, the value should be 6
      await expect(input).toHaveValue('6');

    } catch (e) {
      console.log('--- BROWSER CONSOLE LOGS ---');
      console.log(logs.join('\n'));
      console.log('----------------------------');
      throw e;
    } finally {
      await context.close();
      await saveVideo(page, 'bug-repro-players-per-team', testInfo);
    }
  });
});

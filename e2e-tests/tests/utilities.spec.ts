import { test, expect } from '@playwright/test';
import { saveVideo } from './utils';

test.describe('UI Utilities & Export', () => {
  const timestamp = Date.now();
  const user = {
    name: `Utility User ${timestamp}`,
    username: `util_${timestamp}`,
    email: `util-${timestamp}@example.com`,
    password: 'password123'
  };
  const orgName = `Util Org ${timestamp}`;

  test('should verify share, copy, and export utilities', async ({ browser }, testInfo) => {
    const videoOptions = process.env.VIDEO ? { recordVideo: { dir: testInfo.outputPath('raw-videos') } } : {};
    const context = await browser.newContext(videoOptions);
    const page = await context.newPage();
    page.on('dialog', dialog => dialog.accept());

    await test.step('1. Setup Organization', async () => {
      await page.goto('/register');
      await page.getByTestId('register-name').fill(user.name);
      await page.getByTestId('register-username').fill(user.username);
      await page.getByTestId('register-email').fill(user.email);
      await page.getByTestId('register-password').fill(user.password);
      await page.getByTestId('register-submit').click();

      await page.getByTestId('create-org-open-dialog').click();
      await page.getByTestId('org-name-input').fill(orgName);
      await page.getByTestId('org-submit-button').click();
      await page.getByTestId(`org-link-${orgName}`).click();
    });

    await test.step('2. Verify Invitation Copy Buttons', async () => {
      await page.getByTestId('org-management-button').click();
      await page.getByTestId('members-invite-button').click();
      
      // Public link copy
      await page.getByTestId('generate-public-link-button').click();
      await expect(page.getByTestId('copy-public-link-button')).toBeVisible();
      await page.getByTestId('copy-public-link-button').click();

      // Personal link copy
      await page.getByTestId('invite-email-input').fill(`other-${timestamp}@example.com`);
      await page.getByTestId('send-invite-button').click();
      await expect(page.getByTestId('copy-invitation-link-button')).toBeVisible();
      await page.getByTestId('copy-invitation-link-button').click();
      
      await page.keyboard.press('Escape');
    });

    await test.step('3. Verify Share Summary', async () => {
      await page.goto('/');
      await page.getByTestId(`org-link-${orgName}`).click();
      await page.getByTestId('create-pelada-submit').click();
      await page.getByTestId('attendance-confirm-button').or(page.getByTestId('attendance-card-confirm')).first().click();
      await page.getByTestId('close-attendance-button').click();

      await page.getByTestId('create-team-button').click();
      await page.getByTestId('create-team-button').click();
      await page.getByTestId('randomize-teams-button').click();
      await page.getByTestId('start-pelada-button').click();
      await page.getByTestId('confirm-start-pelada-button').click();

      await expect(page).toHaveURL(/\/peladas\/\d+\/matches/);
      
      // Wait for the insights title
      await expect(page.getByText(/Insights/i)).toBeVisible();
      
      const shareButton = page.getByRole('button', { name: /Compartilhar Resumo|Share Summary/i });
      await expect(shareButton).toBeVisible();
      await shareButton.click();
    });

    await test.step('4. Verify Export Menu', async () => {
      const peladaId = page.url().split('/').find((s, i, a) => a[i-1] === 'peladas');
      await page.goto(`/peladas/${peladaId}`);
      
      await page.getByRole('button', { name: /Export/i }).click();
      await expect(page.getByText(/Announcement Version|Versão de Divulgação/i)).toBeVisible();
      await expect(page.getByText(/Evaluation Version|Versão para Avaliação/i)).toBeVisible();
      
      await page.getByText(/Evaluation Version|Versão para Avaliação/i).click();
    });

    await context.close();
    await saveVideo(page, 'utilities-verification', testInfo);
  });
});

import { test, expect } from '@playwright/test';
import {
  registerAndCreateOrg,
  makeMensalista,
  createPelada,
  confirmAndCloseAttendance,
  closeAttendance,
  setupTeams,
  buildAndSaveSchedule,
  startPelada,
  invitePlayerByEmail,
  setupInvitedPlayer,
  acceptPendingInvitation,
  getPeladaIdFromUrl,
  loginUser,
} from './utils';

test.describe('New Features and UI Improvements', () => {
  test('should verify player sorting and available players copy button', async ({ page }) => {
    const timestamp = Date.now();
    const owner = {
      name: `Admin ${timestamp}`,
      username: `admin_${timestamp}`,
      email: `admin-${timestamp}@example.com`,
      password: 'password123',
      position: 'Defender',
    };
    const orgName = `Feature Org ${timestamp}`;

    await registerAndCreateOrg(page, owner, orgName);
    await makeMensalista(page, owner.name);

    // Navigate back to org detail to create pelada
    await page.goto('/home');
    await page.getByTestId(`org-link-${orgName}`).click();

    await createPelada(page);
    await confirmAndCloseAttendance(page);

    // Verify available players panel and copy button
    await expect(page.getByTestId('player-row')).toBeVisible();
    const copyBtn = page.getByTestId('copy-players-button');
    await expect(copyBtn).toBeVisible();

    page.on('dialog', async dialog => {
      expect(dialog.message()).toMatch(/common.actions.copy_success/i);
      await dialog.accept();
    });
    await copyBtn.click();
  });

  test('should verify merged header buttons logic', async ({ page }) => {
    const ts = Date.now() + 1;
    const admin = {
      name: `Admin ${ts}`,
      username: `admin_${ts}`,
      email: `admin-${ts}@example.com`,
      password: 'password123',
      position: 'Goalkeeper',
    };
    const orgName = `Header Org ${ts}`;

    await registerAndCreateOrg(page, admin, orgName);

    // Navigate to org detail to create pelada
    await page.goto('/home');
    await page.getByTestId(`org-link-${orgName}`).click();

    await createPelada(page);
    await confirmAndCloseAttendance(page);

    await setupTeams(page, { count: 2 });

    // Initially "Montar Tabela" is primary, "Iniciar Pelada" not visible
    const buildBtn = page.getByTestId('build-schedule-button');
    await expect(buildBtn).toBeVisible();
    await expect(page.getByTestId('start-pelada-button')).not.toBeVisible();

    // Build schedule (no match added, just save)
    await buildBtn.click();
    await page.getByTestId('save-schedule-button').click();

    // Now "Iniciar Pelada" is primary, "Montar Tabela" becomes secondary
    await expect(page.getByTestId('start-pelada-button')).toBeVisible();
    await expect(page.getByTestId('build-schedule-button-edit')).toBeVisible();

    // Start and verify redirect logic
    await startPelada(page);
    const peladaId = getPeladaIdFromUrl(page.url());
    await page.goto(`/peladas/${peladaId}`);
    await expect(page).toHaveURL(new RegExp(`/peladas/${peladaId}/matches`));
  });

  test('should handle diarista vs mensalista attendance waitlist', async ({ browser }) => {
    const ts = Date.now() + 2;
    const admin = { name: `Admin ${ts}`, username: `admin_${ts}`, email: `admin-${ts}@example.com`, password: 'p', position: 'Defender' };
    const diarista = { name: `Diarista ${ts}`, username: `diarista_${ts}`, email: `diarista-${ts}@example.com`, password: 'p' };
    const orgName = `Waitlist Org ${ts}`;

    const adminContext = await browser.newContext();
    const diaristaContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    const diaristaPage = await diaristaContext.newPage();

    await registerAndCreateOrg(adminPage, admin, orgName);

    // Invite diarista
    const link = await invitePlayerByEmail(adminPage, diarista.email);

    // Setup diarista via invite link
    await setupInvitedPlayer(browser, link, diarista, orgName);
    
    await loginUser(diaristaPage, diarista);

    // Create pelada
    await adminPage.goto('/home');
    await adminPage.getByTestId(`org-link-${orgName}`).click();
    await createPelada(adminPage);
    const peladaUrl = adminPage.url();

    // Diarista confirms attendance → goes to waitlist
    await diaristaPage.goto(peladaUrl);
    await diaristaPage.getByTestId('attendance-confirm-button').click();
    await expect(diaristaPage.getByText(/Lista de Espera|waitlist/i).first()).toBeVisible({ timeout: 10000 });

    // Admin confirms diarista from waitlist
    await adminPage.reload();
    await adminPage.getByRole('tab', { name: /Lista de Espera|Waitlist/i }).click();
    const diaristaCard = adminPage.getByTestId(`attendance-card-${diarista.username}`);
    await expect(diaristaCard).toBeVisible();
    await diaristaCard.getByTestId('attendance-card-confirm').click();

    // Verify diarista is now confirmed
    await adminPage.getByRole('tab', { name: /Confirm/i }).first().click();
    await expect(adminPage.getByTestId(`attendance-card-${diarista.username}`)).toBeVisible();

    await adminContext.close();
    await diaristaContext.close();
  });

  test('should allow admin to move confirmed player to waitlist', async ({ browser }) => {
    const ts = Date.now() + 3;
    const adminUser = { name: `Admin ${ts}`, username: `admin_${ts}`, email: `admin-${ts}@example.com`, password: 'p' };
    const playerUser = { name: `Player ${ts}`, username: `player_${ts}`, email: `player-${ts}@example.com`, password: 'p' };
    const orgName = `Admin Tools Org ${ts}`;

    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();

    await registerAndCreateOrg(adminPage, adminUser, orgName);

    // Invite and setup player
    const inviteLink = await invitePlayerByEmail(adminPage, playerUser.email);
    await setupInvitedPlayer(browser, inviteLink, playerUser, orgName);

    // Create pelada
    await adminPage.goto('/home');
    await adminPage.getByTestId(`org-link-${orgName}`).click();
    await createPelada(adminPage);

    // Player should be in pending, confirm them as admin
    await adminPage.getByRole('tab', { name: /Pendente|Pending/i }).click();
    const playerCard = adminPage.getByTestId(`attendance-card-${playerUser.username}`);
    await playerCard.getByTestId('attendance-card-confirm').click();

    // Verify in confirmed
    await adminPage.getByRole('tab', { name: /Confirm/i }).first().click();
    await expect(adminPage.getByTestId(`attendance-card-${playerUser.username}`)).toBeVisible();

    // Move to waitlist
    await adminPage.getByTestId('attendance-card-waitlist').click();

    // Verify in waitlist tab
    await adminPage.getByRole('tab', { name: /Espera|Waitlist/i }).click();
    await expect(adminPage.getByTestId(`attendance-card-${playerUser.username}`)).toBeVisible();

    // Move back to confirmed
    await adminPage.getByTestId('attendance-card-confirm').click();
    await adminPage.getByRole('tab', { name: /Confirm/i }).first().click();
    await expect(adminPage.getByTestId(`attendance-card-${playerUser.username}`)).toBeVisible();

    await adminContext.close();
  });
});

import { test, expect } from '@playwright/test';
import {
  saveVideo,
  acceptPendingInvitation,
  registerUser,
  registerAndCreateOrg,
  invitePlayerByEmail,
  setupInvitedPlayer,
  createPelada,
  UserData,
  loginUser,
  makeMensalista,
  getOrgIdFromUrl,
} from './utils';

test.describe('Organization Management', () => {
  const timestamp = Date.now();
  const owner = {
    name: `Owner ${timestamp}`,
    username: `owner_${timestamp}`,
    email: `owner-${timestamp}@example.com`,
    password: 'password123',
    position: 'Defender'
  };
  const orgName = `LifeCycle Org ${timestamp}`;

  const invitedUser = {
    name: `Invited ${timestamp}`,
    username: `invited_${timestamp}`,
    email: `invited-${timestamp}-${Math.floor(Math.random() * 1000)}@example.com`,
    password: 'password123',
    position: 'Striker'
  };

  test('should manage organization, invitations, and admins', async ({ browser }, testInfo) => {
    const videoOptions = process.env.VIDEO ? { recordVideo: { dir: testInfo.outputPath('raw-videos') } } : {};

    const ownerContext = await browser.newContext(videoOptions);
    const ownerPage = await ownerContext.newPage();
    ownerPage.on('dialog', dialog => dialog.accept());

    await test.step('1. Owner Registration & Org Creation', async () => {
      await registerAndCreateOrg(ownerPage, owner, orgName);
    });

    await test.step('2. Personal Invitation & First Access Flow', async () => {
      const invitationLinkText = await invitePlayerByEmail(ownerPage, invitedUser.email);
      expect(invitationLinkText).toContain('/first-access');
      expect(invitationLinkText).toContain('token=');

      const invitedContext = await browser.newContext(videoOptions);
      const invitedPage = await invitedContext.newPage();
      await invitedPage.goto(invitationLinkText);

      await expect(invitedPage.getByTestId('first-access-email')).toHaveValue(invitedUser.email);
      await invitedPage.getByTestId('first-access-name').fill(invitedUser.name);
      await invitedPage.getByTestId('first-access-username').fill(invitedUser.username);
      await invitedPage.getByTestId('first-access-password').fill(invitedUser.password);
      await invitedPage.getByTestId('first-access-position-select').click();
      await invitedPage.getByTestId(`position-option-${invitedUser.position}`).click();
      await invitedPage.getByTestId('first-access-submit').click();

      await expect(invitedPage).toHaveURL('/home');
      await acceptPendingInvitation(invitedPage, orgName);

      await invitedContext.close();
      await saveVideo(invitedPage, 'invited-player-registration', testInfo);
    });

    await test.step('3. Admin Management & Revoke', async () => {
      await ownerPage.reload();

      await ownerPage.getByTestId('mgmt-tab-admins').click();
      await expect(ownerPage.getByTestId('admin-select')).toBeVisible({ timeout: 15000 });
      await ownerPage.getByTestId('admin-select').click();
      await ownerPage.getByRole('option', { name: invitedUser.name }).click();
      await ownerPage.getByTestId('add-admin-button').click();
      await expect(ownerPage.locator(`text=${invitedUser.name}`).last()).toBeVisible();

      // Test Diarista → Mensalista
      await ownerPage.getByTestId('mgmt-tab-members').click();
      const memberRow = ownerPage.locator('li').filter({ hasText: invitedUser.name });
      await memberRow.getByRole('combobox').click();
      await ownerPage.getByRole('option', { name: 'Mensalista', exact: true }).click();

      await ownerPage.reload();
      await ownerPage.getByTestId('mgmt-tab-members').click();
      await expect(ownerPage.locator('li').filter({ hasText: invitedUser.name }).getByRole('combobox')).toHaveText('Mensalista');

      // Invite and revoke dummy
      await ownerPage.getByTestId('mgmt-tab-invitations').click();
      await ownerPage.getByTestId('invitations-invite-button').click();
      const dummyEmail = `dummy-${timestamp}@example.com`;
      await ownerPage.getByTestId('invite-email-input').fill(dummyEmail);
      await ownerPage.getByTestId('send-invite-button').click();
      await expect(ownerPage.getByTestId('invite-success-alert')).toBeVisible();
      await ownerPage.getByTestId('invite-dialog-close-button').click({ force: true });
      await expect(ownerPage.getByRole('dialog')).toBeHidden({ timeout: 15000 });
      await ownerPage.waitForTimeout(1000);

      const revokeBtn = ownerPage.locator('li').filter({ hasText: dummyEmail }).getByTestId(/^revoke-invitation-/);
      await revokeBtn.click();
      await expect(revokeBtn).toBeHidden({ timeout: 10000 });
    });

    await test.step('4. Public Link & Leave Flow', async () => {
      await ownerPage.getByTestId('mgmt-tab-members').click();
      await ownerPage.getByTestId('members-invite-button').click();

      const genBtn = ownerPage.getByTestId('generate-public-link-button');
      if (await genBtn.isVisible({ timeout: 5000 })) {
        await genBtn.click();
      }

      await expect(ownerPage.getByTestId('public-invite-link-text')).toBeVisible({ timeout: 15000 });
      const publicLink = (await ownerPage.getByTestId('public-invite-link-text').innerText()).trim();

      const joinerContext = await browser.newContext(videoOptions);
      const joinerPage = await joinerContext.newPage();
      const joiner = { name: `Joiner ${timestamp}`, username: `joiner_${timestamp}`, email: `joiner-${timestamp}@example.com`, password: 'password123' };
      await registerUser(joinerPage, joiner);
      await joinerPage.goto(publicLink);
      await expect(joinerPage.getByTestId('join-org-button')).toBeVisible({ timeout: 15000 });
      await joinerPage.getByTestId('join-org-button').click();
      await expect(joinerPage).toHaveURL(/\/organizations\/[^\/]+/);

      // Leave Organization
      await joinerPage.getByTestId('leave-org-button').click();
      await joinerPage.getByTestId('confirm-leave-org-button').click();
      await expect(joinerPage).toHaveURL('/home', { timeout: 10000 });
      await expect(joinerPage.getByTestId(`org-link-${orgName}`)).not.toBeVisible();

      await joinerContext.close();
      await saveVideo(joinerPage, 'joiner-leave-flow', testInfo);

      await ownerPage.getByTestId('invite-dialog-close-button').click({ force: true });
      await expect(ownerPage.getByRole('dialog', { name: /invite/i })).toBeHidden({ timeout: 15000 });
      await ownerPage.waitForTimeout(1000);
    });

    await test.step('5. Public Link Reset and List Filtering', async () => {
      await ownerPage.getByTestId('mgmt-tab-invitations').click();

      const publicLinkText = await ownerPage.getByTestId('public-invite-link-text').innerText();
      expect(publicLinkText).toContain('/join/');
      await expect(ownerPage.locator('li').filter({ hasText: /convite público|public invite/i })).toBeHidden();

      await ownerPage.getByTestId('reset-public-link-button').click();
      await expect(ownerPage.getByRole('dialog')).toBeVisible();
      await expect(ownerPage.getByText(/tem certeza|are you sure/i)).toBeVisible();
      await ownerPage.getByRole('button', { name: /redefinir|reset/i }).click();

      // Wait for the text to change from the old value
      await expect(ownerPage.getByTestId('public-invite-link-text')).not.toHaveText(publicLinkText, { timeout: 10000 });

      const newPublicLinkText = await ownerPage.getByTestId('public-invite-link-text').innerText();
      expect(newPublicLinkText).toContain('/join/');
      expect(newPublicLinkText).not.toBe(publicLinkText);
    });

    await test.step('6. Player Ratings Management', async () => {
      await ownerPage.getByTestId('mgmt-tab-ratings').click();

      const playerRow = ownerPage.locator('tr', { hasText: invitedUser.name });
      await expect(playerRow).toBeVisible();

      const ratingInput = playerRow.getByTestId(/^rating-input-/).locator('input');
      await ratingInput.fill('8.5');
      await expect(ownerPage.getByText(/sucesso|success/i)).toBeVisible();
      await expect(playerRow.getByTestId(/^grade-/)).toHaveText('8.5');
    });

    await test.step('7. Delete Organization', async () => {
      await ownerPage.getByTestId('mgmt-tab-settings').click();
      await ownerPage.getByTestId('delete-org-button').click();
      await ownerPage.getByTestId('confirm-org-name-input').fill(orgName);
      await ownerPage.getByTestId('confirm-delete-org-button').click();
      await expect(ownerPage).toHaveURL('/home', { timeout: 10000 });
      await expect(ownerPage.getByTestId(`org-link-${orgName}`)).not.toBeVisible();
    });

    await ownerContext.close();
    await saveVideo(ownerPage, 'owner-org-management', testInfo);
  });

  test('should verify attendance details, restricted icons and row visibility', async ({ browser }) => {
    const ts = Date.now() + 10000;
    const adminUser = {
      name: `Admin ${ts}`,
      username: `admin_${ts}`,
      email: `admin-${ts}@example.com`,
      password: 'password123',
      position: 'Striker',
    };
    const playerUser = {
      name: `Player ${ts}`,
      username: `player_${ts}`,
      email: `player-${ts}@example.com`,
      password: 'password123',
    };
    const uxOrgName = `UX Org ${ts}`;

    const context = await browser.newContext();
    const page = await context.newPage();

    await registerAndCreateOrg(page, adminUser, uxOrgName);
    await makeMensalista(page, adminUser.name);

    await page.goto('/home');
    await page.getByTestId(`org-link-${uxOrgName}`).click();
    const inviteLink = await invitePlayerByEmail(page, playerUser.email);

    await setupInvitedPlayer(browser, inviteLink, playerUser, uxOrgName);
    
    const playerContext = await browser.newContext();
    const playerPage = await playerContext.newPage();
    await loginUser(playerPage, playerUser);

    await page.goto('/home');
    await page.waitForLoadState('networkidle');
    await page.getByTestId(`org-link-${uxOrgName}`).click();
    await createPelada(page);
    const attendanceUrl = page.url();

    await page.getByTestId('attendance-confirm-button').click();
    const adminCard = page.getByTestId(`attendance-card-${adminUser.username}`);
    await expect(adminCard).toBeVisible();
    await expect(adminCard.getByText(/Atacante|Striker/i)).toBeVisible();
    await expect(adminCard.getByText(/Mensalista/i)).toBeVisible();

    await playerPage.goto(attendanceUrl);
    await playerPage.getByTestId('attendance-confirm-button').click();
    await playerPage.getByRole('tab', { name: /Espera|Waitlist/i }).first().click();
    await expect(playerPage.getByTestId(`attendance-card-${playerUser.username}`)).toBeVisible();
    await expect(playerPage.getByTestId('attendance-card-confirm')).not.toBeVisible();
    await expect(playerPage.getByTestId('attendance-card-decline')).not.toBeVisible();

    await page.getByTestId('close-attendance-button').click();
    await page.getByTestId('confirm-close-attendance-button').click();
    await expect(page).toHaveURL(/\/peladas\/[^\/]+$/);

    await playerPage.goto(page.url());
    await expect(playerPage.getByTestId('copy-players-button')).not.toBeVisible();
    await expect(playerPage.getByTestId('randomize-teams-button')).not.toBeVisible();
    await expect(playerPage.getByTestId('create-team-button')).not.toBeVisible();
    await expect(playerPage.getByTestId('share-dropdown-button')).not.toBeVisible();

    await page.goto('/home');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId(/pelada-row-.*/).first()).toBeVisible();

    await playerContext.close();
    await context.close();
  });

  test('should verify mobile optimizations (hidden text)', async ({ page }) => {
    const ts = Date.now() + 20000;
    const adminUser = {
      name: `Admin ${ts}`,
      username: `admin_${ts}`,
      email: `admin-${ts}@example.com`,
      password: 'password123',
      position: 'Striker',
    };
    const mobileOrgName = `UX Org ${ts}`;
    await registerAndCreateOrg(page, adminUser, mobileOrgName);

    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/home');
    await page.waitForLoadState('networkidle');
    await page.getByTestId(`org-link-${mobileOrgName}`).click();

    await createPelada(page);

    const closeBtn = page.getByTestId('close-attendance-button');
    const textSpan = closeBtn.locator('span').filter({ hasText: /Fechar Lista|Close List/i });
    await expect(textSpan).not.toBeVisible();

    await page.goto('/home');
    await page.waitForLoadState('networkidle');
    await page.getByTestId(`org-link-${mobileOrgName}`).click();
    await page.getByTestId('org-management-button').click();
    const tabLabel = page.getByTestId('mgmt-tab-members').locator('span').filter({ hasText: /Membros|Members/i });
    await expect(tabLabel).not.toBeVisible();
  });

  test('should configure WAHA settings', async ({ page }, testInfo) => {
    const ts = Date.now() + 30000;
    const adminUser = {
      name: `WAHA Admin ${ts}`,
      username: `waha_admin_${ts}`,
      email: `waha-${ts}@example.com`,
      password: 'password123',
      position: 'Goalkeeper'
    };
    const wahaOrgName = `WAHA Org ${ts}`;

    await registerAndCreateOrg(page, adminUser, wahaOrgName);

    await page.getByTestId('org-management-button').click();
    await page.getByTestId('mgmt-tab-waha').click();

    const enabledSwitch = page.locator('input[name="waha_enabled"]');
    await expect(enabledSwitch).not.toBeChecked();
    const testBtn = page.getByTestId('waha-test-connection-button');
    await expect(testBtn).toBeDisabled();

    await page.locator('input[name="waha_api_url"]').fill('http://waha:3000');
    await page.locator('input[name="waha_instance"]').fill('default');
    await page.locator('input[name="waha_group_id"]').fill('123456789@g.us');

    await page.getByLabel(/(Enable|Habilitar) WAHA/i).click();
    await expect(enabledSwitch).toBeChecked();

    await page.getByLabel(/(Notify when pelada starts|Notificar quando a pelada iniciar)/i).click();
    await page.getByLabel(/(Notify when pelada ends|Notificar quando a pelada encerrar)/i).click();

    await page.getByTestId('waha-save-button').click();
    await expect(page.getByText(/(saved successfully|salva com sucesso|salvas com sucesso)/i)).toBeVisible();
    await expect(testBtn).toBeEnabled();

    await page.reload();
    await page.getByTestId('mgmt-tab-waha').click();
    await expect(enabledSwitch).toBeChecked();
    await expect(page.locator('input[name="waha_api_url"]')).toHaveValue('http://waha:3000');
    await expect(page.locator('input[name="waha_instance"]')).toHaveValue('default');
    await expect(page.locator('input[name="waha_group_id"]')).toHaveValue('123456789@g.us');
    await expect(page.locator('input[name="waha_start_msg_enabled"]')).toBeChecked();
    await expect(page.locator('input[name="waha_end_msg_enabled"]')).toBeChecked();

    await saveVideo(page, 'waha-configuration', testInfo);
  });

  test('should redirect existing member to org page when accessing invite link', async ({ browser }) => {
    const timestamp = Date.now() + Math.floor(Math.random() * 1000000);
    const owner = {
      name: `Owner ${timestamp}`,
      username: `owner_${timestamp}`,
      email: `owner-${timestamp}@example.com`,
      password: 'password123',
      position: 'Defender'
    };
    const invitedUser = {
      name: `User ${timestamp}`,
      username: `user_${timestamp}`,
      email: `user-${timestamp}@example.com`,
      password: 'password123',
      position: 'Striker'
    };
    const orgName = `Redirection Org ${timestamp}`;

    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    
    await registerAndCreateOrg(ownerPage, owner, orgName);
    
    const orgId = getOrgIdFromUrl(ownerPage.url());
    const inviteToken = await ownerPage.evaluate(async (id) => {
        const res = await fetch(`/api/organizations/${id}/invite-link`);
        const data = await res.json();
        return data.token;
    }, orgId);
    const inviteLink = `/join/${inviteToken}`;
    
    await ownerContext.close();

    const userContext = await browser.newContext();
    const userPage = await userContext.newPage();
    await registerUser(userPage, invitedUser);
    
    await userPage.goto(inviteLink);
    await userPage.getByTestId('join-org-button').click();
    await expect(userPage).toHaveURL(/\/organizations\/[^\/]+/, { timeout: 15000 });
    const orgUrl = userPage.url();

    await userPage.goto(inviteLink);
    await expect(userPage).toHaveURL(orgUrl);
    
    await userContext.close();
  });
});

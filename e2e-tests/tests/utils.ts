import { Page, TestInfo, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Saves the video recorded for a page/context to a descriptive filename.
 */
export async function saveVideo(page: Page, name: string, testInfo: TestInfo) {
  if (!process.env.VIDEO) return;
  
  try {
    const video = page.video();
    if (!video) return;

    const newPath = testInfo.outputPath(`${name}.webm`);
    const dir = path.dirname(newPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    await video.saveAs(newPath);

    try {
      const originalPath = await video.path();
      if (originalPath && fs.existsSync(originalPath)) {
        fs.unlinkSync(originalPath);
      }
    } catch (unlinkErr) {
      // Ignore errors
    }
  } catch (err) {
    console.error(`Failed to save video ${name}:`, err);
  }
}

/**
 * Registers a new user.
 */
export async function registerUser(page: Page, user: { name: string, username: string, email: string, password: string, position?: string }) {
  await page.goto('/register');
  await page.getByTestId('register-name').fill(user.name);
  await page.getByTestId('register-username').fill(user.username);
  await page.getByTestId('register-email').fill(user.email);
  await page.getByTestId('register-password').fill(user.password);
  
  if (user.position) {
    const posSelect = page.getByRole('combobox').filter({ hasText: /Position|Posição/i }).or(page.getByTestId('register-position-select').getByRole('combobox'));
    await posSelect.click();
    await page.getByRole('option', { name: user.position }).click();
  }
  
  await page.getByTestId('register-submit').click();
  await expect(page).toHaveURL('/', { timeout: 10000 });
  await page.waitForLoadState('networkidle');
}

/**
 * Creates a new organization.
 */
export async function createOrganization(page: Page, orgName: string) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.getByTestId('create-org-open-dialog').or(page.getByTestId('create-org-button')).or(page.getByRole('button', { name: /Criar Organização|Create Organization/i })).click();
  
  const orgInput = page.getByTestId('org-name-input').or(page.locator('input[name="name"]'));
  await orgInput.fill(orgName);
  
  const submitBtn = page.getByTestId('org-submit-button').or(page.getByTestId('create-org-submit')).or(page.getByRole('button', { name: /Criar|Create/i }));
  await submitBtn.click();
  
  await expect(page.getByTestId(`org-link-${orgName}`).or(page.getByText(orgName).first())).toBeVisible({ timeout: 15000 });
  
  const orgLink = page.getByTestId(`org-link-${orgName}`).or(page.getByText(orgName).first());
  await orgLink.click();
  
  // Wait specifically for the URL to change to the organization page
  await expect(page).toHaveURL(/\/organizations\/\d+/, { timeout: 15000 });
  await page.waitForLoadState('networkidle');
}

/**
 * Helper to accept a pending invitation on the home page.
 */
export async function acceptPendingInvitation(page: Page, orgName: string) {
  await page.waitForTimeout(2000);
  await page.goto('/');
  
  const inviteCard = page.getByTestId(`invitation-card-${orgName}`);
  
  await expect(async () => {
    if (!await inviteCard.isVisible()) {
      await page.reload();
      await page.waitForTimeout(1000);
    }
    await expect(inviteCard).toBeVisible({ timeout: 5000 });
  }).toPass({ timeout: 10000 });
  
  const acceptBtn = page.getByTestId(`accept-invitation-${orgName}`);
  await acceptBtn.click();
  
  await expect(async () => {
    const orgLink = page.getByTestId(`org-link-${orgName}`);
    if (!await orgLink.isVisible()) {
      await page.goto('/'); 
      await page.waitForLoadState('networkidle');
    }
    await expect(orgLink).toBeVisible({ timeout: 5000 });
  }).toPass({ timeout: 15000 });
  
  await page.getByTestId(`org-link-${orgName}`).click();
}

/**
 * Navigates to organization management and invites a player by email.
 * Returns the invitation link.
 */
export async function invitePlayerByEmail(page: Page, email: string): Promise<string> {
  const mgmtBtn = page.getByTestId('org-management-button');
  const mgmtLink = page.getByRole('link', { name: /MANAGEMENT|GERENCIAMENTO/i });
  
  // Try to find it, if not, reload and try again
  if (!await mgmtBtn.isVisible() && !await mgmtLink.isVisible()) {
    await page.waitForTimeout(3000);
    await page.reload();
    await page.waitForLoadState('networkidle');
  }

  const target = mgmtBtn.or(mgmtLink);
  await expect(target).toBeVisible({ timeout: 15000 });
  await target.click();
  await page.getByTestId('members-invite-button').click();
  
  const emailInput = page.getByTestId('invite-email-input').or(page.locator('input[placeholder="Name / Email"]'));
  await emailInput.fill(email);
  
  await page.getByTestId('send-invite-button').click();
  await expect(page.getByTestId('invite-success-alert')).toBeVisible({ timeout: 15000 });
  const link = await page.getByTestId('invitation-link-text').innerText();
  await page.getByTestId('invite-dialog-close-button').click();
  return link;
}

/**
 * Navigates to organization management and adds a player by searching for them.
 */
export async function addPlayerBySearch(page: Page, query: string) {
  const mgmtBtn = page.getByTestId('org-management-button').or(page.getByRole('link', { name: /MANAGEMENT|GERENCIAMENTO/i }));
  await expect(mgmtBtn).toBeVisible({ timeout: 10000 });
  await mgmtBtn.click();
  await page.getByTestId('members-add-button').click();
  
  const searchInput = page.locator('input[placeholder="Name / Email"]');
  await searchInput.fill(query);
  
  await page.waitForTimeout(1000); // Debounce
  await page.getByRole('checkbox').first().click();
  await page.getByRole('button', { name: /Add selected|Adicionar selecionados/i }).click();
}





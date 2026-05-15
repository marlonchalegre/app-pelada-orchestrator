import { test, expect } from '@playwright/test';
import { registerUser, registerAndCreateOrg, invitePlayerByEmail, acceptPendingInvitation, getOrgIdFromUrl } from './utils';

test.describe('Organization Join Redirection', () => {
  const timestamp = Date.now();
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

  test('should redirect existing member to org page when accessing invite link', async ({ browser }) => {
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    
    // 1. Create org
    await registerAndCreateOrg(ownerPage, owner, orgName);
    
    // Get invite link properly: use the public join link
    const orgId = getOrgIdFromUrl(ownerPage.url());
    const inviteToken = await ownerPage.evaluate(async (id) => {
        const res = await fetch(`/api/organizations/${id}/invite-link`);
        const data = await res.json();
        return data.token;
    }, orgId);
    const inviteLink = `/join/${inviteToken}`;
    
    await ownerContext.close();

    // 2. Register invited user and join org
    const userContext = await browser.newContext();
    const userPage = await userContext.newPage();
    await registerUser(userPage, invitedUser);
    
    // Accept invite
    await userPage.goto(inviteLink);
    await userPage.getByTestId('join-org-button').click();
    await expect(userPage).toHaveURL(/\/organizations\/[^\/]+/, { timeout: 15000 });
    const orgUrl = userPage.url();

    // 3. Access invite link again
    await userPage.goto(inviteLink);
    
    // Should be redirected to the org page
    await expect(userPage).toHaveURL(orgUrl);
    
    await userContext.close();
  });
});

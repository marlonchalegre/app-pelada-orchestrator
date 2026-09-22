import { test, expect } from '@playwright/test';
import {
  registerUser,
  createOrganization,
  createPeladaFromAgenda,
  closeAttendanceList,
  drawAndStartPelada,
  visible,
} from './utils';

test.describe('Share Pelada Summary', () => {
  const timestamp = Date.now();
  const owner = {
    name: `Owner ${timestamp}`,
    username: `user_share_${timestamp}`,
    email: `share-owner-${timestamp}@example.com`,
    password: 'password123',
    position: 'Defender',
  };
  const orgName = `Share Org ${timestamp}`;

  test('should show share summary option behind the export dropdown', async ({
    page,
  }) => {
    await registerUser(page, owner);
    await createOrganization(page, orgName);

    await createPeladaFromAgenda(page);
    await visible(page, 'attendance-confirm-button').click();
    await closeAttendanceList(page);
    await drawAndStartPelada(page);

    await expect(page.getByText(/Insights/i)).toBeVisible();

    // The share action moved behind the export/share dropdown
    const shareDropdown = visible(page, 'share-dropdown-button');
    await expect(shareDropdown).toBeVisible();
    await shareDropdown.click();
    await expect(
      page.getByText(/Compartilhar Resumo|Share Summary/i),
    ).toBeVisible();
  });
});

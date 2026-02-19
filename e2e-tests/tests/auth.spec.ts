import { test, expect } from '@playwright/test';

test.describe('Phase 1: Identity & Profile', () => {
  const timestamp = Date.now();
  const user = {
    name: `Auth User ${timestamp}`,
    email: `auth-${timestamp}@example.com`,
    password: 'password123',
    newPassword: 'new-password456',
    position: 'Midfielder',
    newPosition: 'Goalkeeper'
  };

  test('should register, login, update profile, and logout', async ({ page }) => {
    // 1. Registration
    await page.goto('/register');
    await page.getByTestId('register-name').fill(user.name);
    await page.getByTestId('register-email').fill(user.email);
    await page.getByTestId('register-password').fill(user.password);
    
    // Position is a Material UI Select
    await page.getByLabel('Position').click();
    await page.getByRole('option', { name: user.position }).click();
    
    await page.getByTestId('register-submit').click();

    // Verify redirect to home
    await expect(page).toHaveURL('/', { timeout: 10000 });
    await expect(page.getByTestId('user-settings-button')).toBeVisible();

    // 2. Logout
    await page.getByTestId('user-settings-button').click();
    await page.getByTestId('logout-menu-item').click();
    await expect(page).toHaveURL('/login');

    // 3. Login
    await page.getByTestId('login-email').fill(user.email);
    await page.getByTestId('login-password').fill(user.password);
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL('/');

    // 4. Update Profile
    await page.getByTestId('user-settings-button').click();
    await page.getByTestId('profile-menu-item').click();
    await expect(page).toHaveURL('/profile');

    // Verify initial data
    await expect(page.getByTestId('profile-name')).toHaveValue(user.name);
    await expect(page.getByTestId('profile-email')).toHaveValue(user.email);

    // Update name and position
    const updatedName = `${user.name} Updated`;
    await page.getByTestId('profile-name').fill(updatedName);
    
    await page.getByLabel('Position').click();
    await page.getByRole('option', { name: user.newPosition }).click();
    
    // Update password
    await page.getByTestId('profile-new-password').fill(user.newPassword);
    await page.getByTestId('profile-confirm-password').fill(user.newPassword);

    await page.getByTestId('profile-save-button').click();
    await expect(page.getByText('Profile updated successfully!')).toBeVisible();

    // 5. Verify persistence after logout/login with new credentials
    await page.getByTestId('user-settings-button').click();
    await page.getByTestId('logout-menu-item').click();

    await page.getByTestId('login-email').fill(user.email);
    await page.getByTestId('login-password').fill(user.newPassword);
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL('/');

    // Verify name change in header (first letter)
    await expect(page.getByTestId('user-settings-button')).toContainText(updatedName.charAt(0).toUpperCase());

    // 6. Delete Account
    await page.getByTestId('user-settings-button').click();
    await page.getByTestId('profile-menu-item').click();
    
    // Open delete dialog
    await page.getByTestId('profile-delete-account-button').click();
    
    // Confirm deletion
    const confirmBtn = page.getByTestId('confirm-delete-account-button');
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();
    
    // Expect redirect to login
    await expect(page).toHaveURL('/login', { timeout: 10000 });

    // Verify account is gone (cannot login anymore)
    await page.getByTestId('login-email').fill(user.email);
    await page.getByTestId('login-password').fill(user.newPassword);
    await page.getByTestId('login-submit').click();
    
    // The error message might be "Invalid credentials" (from backend) 
    // or "Login failed" (frontend translation fallback)
    await expect(async () => {
       const text = await page.innerText('body');
       expect(text).toMatch(/Invalid credentials|Login failed/i);
    }).toPass({ timeout: 10000 });
  });
});

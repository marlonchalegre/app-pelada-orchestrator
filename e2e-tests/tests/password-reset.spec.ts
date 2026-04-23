import { test, expect } from '@playwright/test';
import { saveVideo, registerUser } from './utils';

test.describe('Password Reset Flow', () => {
  const timestamp = Date.now();
  const user = {
    name: `Reset User ${timestamp}`,
    username: `reset_${timestamp}`,
    email: `reset-${timestamp}@example.com`,
    password: 'old-password123',
    position: 'Striker',
  };

  test('should complete the password reset flow', async ({ page }, testInfo) => {
    // 1. Register a user first
    await registerUser(page, user);
    
    // Logout to test the forgot password link
    await page.getByTestId('user-settings-button').click();
    await page.getByTestId('logout-menu-item').click();
    await expect(page).toHaveURL('/');

    // 2. Go to Forgot Password page
    await page.goto('/login');
    await page.getByRole('link', { name: /Forgot your password|Esqueceu sua senha/i }).click();
    await expect(page).toHaveURL(/\/forgot-password/);

    // 3. Request reset
    await page.getByTestId('forgot-password-email').fill(user.email);
    
    // Wait for the API response
    const responsePromise = page.waitForResponse(response => 
      response.url().includes('/auth/forgot-password') && response.status() === 200
    );
    
    await page.getByTestId('forgot-password-submit').click();
    await responsePromise;

    // 4. Verify success message
    await expect(page.getByText(/If an account with (that|this) email exists|Se uma conta com este email existir/i)).toBeVisible({ timeout: 10000 });

    // 5. Since we can't easily get the token from email in E2E, 
    // we'll test the Reset Password page components by navigating directly if we had a token.
    // However, to really test the logic, we'd need to mock the backend or have a way to get the token.
    // For this E2E, we'll verify the UI of the reset page.
    
    await page.goto('/reset-password?token=mock-token');
    
    // Test password mismatch
    await page.getByTestId('reset-password-input').fill('new-password123');
    await page.getByTestId('reset-password-confirm').fill('different-password');
    await page.getByTestId('reset-password-submit').click();
    await expect(page.getByText(/Passwords do not match|As senhas não coincidem/i)).toBeVisible();

    // We can't test a successful reset here because 'mock-token' is invalid in the real DB.
    // But we've verified the navigation, the forgot password request UI, and the reset page validation.
    
    await saveVideo(page, 'password-reset-flow', testInfo);
  });
});

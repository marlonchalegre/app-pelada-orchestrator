import { test, expect } from '@playwright/test';

test.describe('Password Visibility Toggle', () => {
  test('should toggle password visibility in Login, Register, and Reset Password pages', async ({ page }) => {
    // Helper to test visibility toggle
    const testToggle = async (inputSelector: string) => {
      const input = page.getByTestId(inputSelector);
      const toggleButton = input.locator('..').getByRole('button'); // Finds the button inside the field container

      await expect(input).toHaveAttribute('type', 'password');
      await toggleButton.click();
      await expect(input).toHaveAttribute('type', 'text');
      await toggleButton.click();
      await expect(input).toHaveAttribute('type', 'password');
    };

    // 1. Login Page
    await page.goto('/login');
    await testToggle('login-password');

    // 2. Register Page
    await page.goto('/register');
    await testToggle('register-password');

    // 3. Reset Password Page
    await page.goto('/reset-password?token=mock-token');
    await testToggle('reset-password-input');
    await testToggle('reset-password-confirm');
  });
});

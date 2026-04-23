import { test, expect } from '@playwright/test';
import { registerUser } from './utils';

test.describe('Auth Redirection Bugs', () => {
  const generateUser = () => {
    const timestamp = Date.now() + Math.floor(Math.random() * 10000);
    return {
      name: `Auth User ${timestamp}`,
      username: `user_${timestamp}`,
      email: `auth-${timestamp}@example.com`,
      password: 'password123',
      position: 'Midfielder',
    };
  };

  test('unauthenticated user should be redirected from protected page to welcome page', async ({ page }) => {
    // Clear any existing state
    await page.goto('/login');
    await page.evaluate(() => localStorage.clear());
    
    // Try to access /home (protected)
    await page.goto('/home');
    
    // Should be redirected to / (Welcome)
    await expect(page).toHaveURL(/\/$/);
  });

  test('authenticated user should be redirected from login page to home', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const user = generateUser();

    // Register/Login
    await registerUser(page, user);
    await expect(page).toHaveURL('/home');

    // Try to access login page
    await page.goto('/login');

    // Should be redirected back to /home
    await expect(page).toHaveURL('/home', { timeout: 10000 });
    
    await context.close();
  });

  test('authenticated user should be redirected from register page to home', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const user = generateUser();

    // Register/Login
    await registerUser(page, user);
    await expect(page).toHaveURL('/home');

    // Try to access register page
    await page.goto('/register');

    // Should be redirected back to /home
    await expect(page).toHaveURL('/home', { timeout: 10000 });

    await context.close();
  });

  test('user with invalid token should be redirected to welcome page', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Set an invalid token in localStorage
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.setItem('authToken', 'invalid-token-header.invalid-payload.invalid-signature');
      localStorage.setItem('authUser', JSON.stringify({ id: 1, name: 'Fake User', username: 'fake' }));
    });

    // Try to access home page
    await page.goto('/home');

    // Should be redirected to / because AuthProvider should clear invalid token
    await expect(page).toHaveURL(/\/$/);

    await context.close();
  });
});

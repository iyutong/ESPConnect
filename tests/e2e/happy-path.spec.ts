import { test, expect, type Page } from '@playwright/test';

async function connectHappyPath(page: Page) {
  await page.goto('/?e2e=1');
  const connectButton = page.getByTestId('connect-btn');
  await expect(connectButton).toBeEnabled();
  await connectButton.click();

  const status = page.getByTestId('connection-status');
  await expect(status).toContainText('Connected');
}

test('Connect happy path', async ({ page }) => {
  await connectHappyPath(page);

  const summary = page.getByTestId('device-summary');
  await expect(summary).toBeVisible();
  await expect(summary).toContainText('ESP32-S3');
  await expect(summary).toContainText('aa:bb:cc:dd:ee:ff');
});

test('Tool happy path', async ({ page }) => {
  await connectHappyPath(page);

  await page.getByText('Flash Tools', { exact: true }).click();

  const toolCard = page.getByTestId('tool-integrity-card');
  await expect(toolCard).toBeVisible();

  await toolCard.getByLabel('Length (bytes)', { exact: true }).fill('0x1000');
  await toolCard.getByTestId('tool-integrity-run').click();

  const toast = page.getByTestId('toast-container');
  await expect(toast).toBeVisible();
  await expect(toast).toContainText('MD5 checksum computed.');

  await expect(toolCard).toContainText('MD5 checksum:');
  await expect(toolCard).toContainText('d41d8cd98f00b204e9800998ecf8427e');
});

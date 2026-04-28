import { test, expect } from "@playwright/test";

const APP = "http://localhost:3000";
const USER = "Kabir";
const PW = "101510";

test.describe.configure({ mode: "serial" });

test("invisibility: catchall 404 and login is generic", async ({ page }) => {
  const r1 = await page.goto(`${APP}/some-random-thing`);
  expect(r1?.status()).toBe(404);

  const r2 = await page.goto(`${APP}/login`);
  expect(r2?.status()).toBe(200);
  await expect(page).toHaveTitle(/Sign In/);
});

test("login + dashboard + sidebar nav", async ({ page }) => {
  await page.goto(`${APP}/login`);
  await page.fill("#username", USER);
  await page.fill("#password", PW);
  await page.click("button[type=submit]");
  await page.waitForURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: /Hi, Kabir/ })).toBeVisible();

  await page.click('text="Products"');
  await page.waitForURL(/\/products/);
  await expect(page.getByText("Astberg ERV AHE-50 500CMH")).toBeVisible();

  await page.click('text="Clients"');
  await page.waitForURL(/\/clients/);
  await expect(page.getByText("Mr. Mohit Jain")).toBeVisible();

  await page.click('text="Users"');
  await page.waitForURL(/\/settings\/users/);
  // The current user is marked "(you)" in the table — uniquely identifies our row.
  await expect(page.getByText("(you)")).toBeVisible();
});

test("product detail loads with cost field", async ({ page }) => {
  await page.goto(`${APP}/login`);
  await page.fill("#username", USER);
  await page.fill("#password", PW);
  await page.click("button[type=submit]");
  await page.waitForURL(/\/dashboard/);

  await page.goto(`${APP}/products`);
  await page
    .getByRole("link", { name: "Astberg ERV AHE-50 500CMH" })
    .click();
  await page.waitForURL(/\/products\//);
  // The form has labelled inputs; assert the owner-only cost field exists.
  await expect(page.locator('input[name="defaultUnitPrice"]')).toBeVisible();
  await expect(page.locator('input[name="costPrice"]')).toBeVisible();
});

test("quote builder loads, totals compute", async ({ page }) => {
  await page.goto(`${APP}/login`);
  await page.fill("#username", USER);
  await page.fill("#password", PW);
  await page.click("button[type=submit]");
  await page.waitForURL(/\/dashboard/);

  await page.goto(`${APP}/quotes/new?type=rough`);
  await expect(page.getByText("Header")).toBeVisible();
  await expect(page.getByText(/Section A/i).first()).toBeVisible();
  await expect(page.getByText("Totals")).toBeVisible();
  await expect(page.getByText(/Owner only/)).toBeVisible();
});

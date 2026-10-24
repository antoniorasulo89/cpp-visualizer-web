import { test, expect } from "@playwright/test";

const source =
  '#include <iostream>\nint main(){int x;double y;std::cout<<"Intero: ";std::cin>>x;std::cout<<"Reale: ";std::cin>>y;std::cout<<x+y*2;}';
for (const mode of ["cpp", "flow"]) {
  test(`${mode}: eco e a capo, trasferimento visibile, ripresa automatica tra due input`, async ({
    page,
  }) => {
    await page.goto("/wasm-demo/?mode=cpp&input=interactive");
    await page.locator("#code").fill(source);
    if (mode === "flow") {
      await page.locator("#cpp-to-flow").click();
      await expect(page.locator("#mode-flow")).toHaveAttribute(
        "aria-pressed",
        "true",
        { timeout: 95000 },
      );
    }
    await page.locator("#run").click();
    await expect(page.locator("#next")).toBeEnabled({ timeout: 95000 });
    await page.locator("#speed").selectOption("8");
    await page.locator("#play").click();
    await expect(page.locator("#input-dialog")).toBeVisible();
    if (mode === "cpp") {
      await page.locator("#input-value").fill("errato");
      await page.locator("#input-value").press("Enter");
      await expect(page.locator("#input-error")).toContainText("intero");
      await expect(page.locator("#console")).toHaveText("Intero: ");
    }
    await page.locator("#input-value").fill("4");
    await page.locator("#input-value").press("Enter");
    await expect(page.locator(".input-flight")).toBeVisible();
    await expect(page.locator(".input-flight strong")).toHaveText("4");
    await expect(page.locator('[data-variable="x"] strong')).toBeHidden();
    await expect(page.locator("#console")).toHaveText("Intero: 4\n");
    expect(
      await page
        .locator(".input-flight strong")
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
    ).toBeGreaterThanOrEqual(32);
    await expect(page.locator("#input-dialog")).toBeVisible();
    await expect(page.locator("#input-question")).toContainText("y");
    await page.locator("#input-value").fill("2.5");
    await page.locator("#input-value").press("Enter");
    await expect(page.locator("#run")).toBeEnabled({ timeout: 95000 });
    await expect(page.locator("#console")).toHaveText(
      "Intero: 4\nReale: 2.5\n9",
    );
    await page.locator("#timeline").focus();
    await page.keyboard.press("Home");
    await expect(page.locator("#console")).not.toContainText("4");
    await page.keyboard.press("End");
    await expect(page.locator("#console")).toHaveText(
      "Intero: 4\nReale: 2.5\n9",
    );
  });
}

test("Pausa durante il trasferimento annulla la ripresa automatica", async ({
  page,
}) => {
  await page.goto("/wasm-demo/?mode=cpp&input=interactive");
  await page
    .locator("#code")
    .fill("#include <iostream>\nint main(){int x;std::cin>>x;std::cout<<x+1;}");
  await page.locator("#run").click();
  await expect(page.locator("#next")).toBeEnabled({ timeout: 95000 });
  await page.locator("#speed").selectOption("8");
  await page.locator("#play").click();
  await expect(page.locator("#input-dialog")).toBeVisible();
  await page.locator("#input-value").fill("5");
  await page.locator("#input-value").press("Enter");
  await expect(page.locator(".input-flight")).toBeVisible();
  await expect(page.locator("#play")).toHaveAttribute("aria-pressed", "true");
  await page.locator("#play").click();
  await page.waitForTimeout(1500); // Let both the transfer and a playback tick elapse.
  await expect(page.locator("#run")).toBeDisabled();
  await expect(page.locator("#console")).toHaveText("5\n");
  await expect(page.locator("#next")).toBeEnabled();
  await expect(page.locator("#play")).toHaveAttribute("aria-pressed", "false");
  await page.locator("#play").click();
  await expect(page.locator("#run")).toBeEnabled();
  await expect(page.locator("#console")).toHaveText("5\n6");
});

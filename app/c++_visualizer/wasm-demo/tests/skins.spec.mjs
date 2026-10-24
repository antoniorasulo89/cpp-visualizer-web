import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test.use({ serviceWorkers: "block" });

const skins = ["laboratorio", "mappa", "segnali", "classica"];
const key = "dentro-il-codice-skin-v1:/wasm-demo/";

test("skin persistente senza perdere programma, input o traccia", async ({
  page,
}) => {
  await page.goto("/wasm-demo/?input=prepared");
  await page.locator("#input").fill("5 10");
  const code = await page.locator("#code").inputValue();
  await page.locator("#run").click();
  await expect(page.locator("#run")).toBeEnabled({ timeout: 95000 });
  await page.locator("#timeline").focus();
  await page.keyboard.press("End");
  await expect(page.locator("#console")).toHaveText("Somma = 15\n");
  const step = await page.locator("#step").textContent();
  await page.locator(".settings-link").click();
  for (const skin of skins) {
    await page.locator(`#settings input[value="${skin}"]`).check();
    await expect(page.locator("html")).toHaveAttribute("data-skin", skin);
    await expect(page.locator("#step")).toHaveText(step);
    await expect(page.locator("#code")).toHaveValue(code);
    await expect(page.locator("#input")).toHaveValue("5 10");
    await expect(page.locator("#console")).toHaveText("Somma = 15\n");
  }
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-skin", "classica");
  await expect(page.locator("#input")).toHaveValue("5 10");
  await page.locator(".settings-link").click();
  await page.locator('input[value="classica"]').focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator("html")).toHaveAttribute("data-skin", "segnali");
});

test("tutte le skin: accessibilità, larghezze mobili e modifica del diagramma", async ({
  page,
}, info) => {
  await page.goto("/wasm-demo/?mode=flow&input=prepared");
  const axe = await readFile(
    new URL("../node_modules/axe-core/axe.min.js", import.meta.url),
    "utf8",
  );
  await page.route("**/__axe.js", (route) =>
    route.fulfill({ contentType: "application/javascript", body: axe }),
  );
  await page.addScriptTag({ url: "/__axe.js" });
  await page.locator(".settings-link").click();
  for (const skin of skins) {
    await page.locator(`#settings input[value="${skin}"]`).check();
    for (const width of [320, 375, 414, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (width === 375 || width === 1440) {
        const violations = await page.evaluate(async () =>
          (
            await window.axe.run(document, {
              runOnly: {
                type: "tag",
                values: ["wcag2a", "wcag2aa", "wcag21aa"],
              },
            })
          ).violations.map((v) => ({
            id: v.id,
            targets: v.nodes.map((n) => n.target),
          })),
        );
        expect(violations).toEqual([]);
      }
    }
    await page.locator(".settings-link").click();
    await page.screenshot({
      path: info.outputPath(skin + ".png"),
      fullPage: true,
    });
    await page.locator(".settings-link").click();
  }
  await page.locator(".settings-link").click();
  await page.locator('.flow-node[role="button"]').first().click();
  await expect(page.locator(".flow-inspector input").first()).toBeVisible();
  await page.locator(".flow-inspector input").first().fill("numero");
  await page.locator(".flow-inspector input").first().press("Tab");
  await expect(page.locator(".flow-canvas")).toContainText("numero");
});

test("preferenza sconosciuta o storage bloccato: selettore utilizzabile", async ({
  page,
}) => {
  await page.addInitScript(
    (storageKey) => localStorage.setItem(storageKey, "__proto__"),
    key,
  );
  await page.goto("/wasm-demo/?input=prepared");
  await expect(page.locator("html")).toHaveAttribute(
    "data-skin",
    "laboratorio",
  );
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error("storage blocked");
    };
    Storage.prototype.setItem = () => {
      throw new Error("storage blocked");
    };
  });
  await page.reload();
  await page.locator(".settings-link").click();
  await page.locator('input[value="mappa"]').check();
  await expect(page.locator("html")).toHaveAttribute("data-skin", "mappa");
  await expect(page.locator("#skin-status")).toContainText(
    "Salvataggio non disponibile",
  );
});

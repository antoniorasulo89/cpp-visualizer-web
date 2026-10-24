import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { boundMemory } from "../scripts/wasm-limits.mjs";
import { gzipSync, gunzipSync } from "node:zlib";
let serial = 0;
const n = (kind, fields = {}) => ({
  id: "release" + ++serial,
  kind,
  ...fields,
});
const decl = (name, init = "0") =>
  n("declare", {
    name,
    init,
    type: "int",
    mode: "value",
    size: "",
    constant: false,
  });
const doc = (body, scope) => ({
  format: "dentro-il-codice-flowchart",
  version: 1,
  ...(scope ? { scope } : {}),
  functions: [
    { id: "main", name: "main", returnType: "int", params: [], body },
  ],
});
async function run(page) {
  await page
    .getByRole("button", { name: "Compila e visualizza", exact: true })
    .click();
  await expect(page.locator("#run")).toBeEnabled({ timeout: 95000 });
}
async function end(page) {
  await page.locator("#timeline").focus();
  await page.keyboard.press("End");
}
async function load(page, document) {
  await page.locator("#flow-pane input[type=file]").setInputFiles({
    name: "release.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(document)),
  });
  await expect(page.locator("#flow-pane input[type=file]")).toHaveValue("");
}
async function flow(page) {
  await page.getByRole("button", { name: "Flowchart", exact: true }).click();
}
test.beforeEach(async ({ page }) => {
  await page.goto("/wasm-demo/?input=prepared");
  await page.locator("#cpp-trace").selectOption("manual");
});
test("C++ e flowchart: calcolo, passi, rami, download e limite fisico memoria", async ({
  page,
}) => {
  await page.locator("#code").fill(`#include <iostream>
int main() {
  int limite=5; OSSERVA(limite);
  int somma=0; OSSERVA(somma);
  int i=1; OSSERVA(i);
  while(i<=limite) { somma+=i; OSSERVA(somma); ++i; OSSERVA(i); }
  std::cout<<"Somma = "<<somma<<std::endl; OSSERVA(somma);
  return 0;
}`);
  await run(page);
  await expect(page.locator("#status")).toContainText("14 osservazioni");
  await end(page);
  await expect(page.locator("#console")).toHaveText("Somma = 15\n");
  const download = page.waitForEvent("download");
  await page.locator("#download").click();
  const binary = await readFile(await (await download).path());
  const limits = boundMemory(binary, 65536).memories;
  expect(limits[0].max).toBe(1024);
  await flow(page);
  await run(page);
  await expect(page.locator("#status")).toContainText("22 osservazioni");
  await end(page);
  await expect(page.locator('[data-node="main:end"]')).toHaveClass(
    /flow-active/,
  );
  await page.locator("#timeline").focus();
  await page.keyboard.press("Home");
  for (let i = 0; i < 4; i++) await page.locator("#next").click();
  await expect(page.locator("#event")).toContainText("VERA");
  await expect(
    page.locator(".flow-edge.flow-chosen.flow-true"),
  ).not.toHaveCount(0);
  await end(page);
  for (let i = 0; i < 3; i++) await page.locator("#prev").click();
  await expect(page.locator("#event")).toContainText("FALSA");
  await expect(page.locator("#console")).toHaveText("—");
});
test("regressioni audit: Unicode, nomi completi, collisioni e for con cast", async ({
  page,
}) => {
  await flow(page);
  const prefix = "a".repeat(64);
  await load(
    page,
    doc([
      decl(prefix + "x", "7"),
      decl(prefix + "y", "9"),
      decl("cv_trace", "0"),
      n("for", {
        init: "cv_trace = static_cast<int>(0)",
        condition: "cv_trace < 2",
        update: "++cv_trace",
        body: [],
      }),
      n("output", {
        expression: `u8"città € " << ${prefix + "x"} << " " << ${prefix + "y"} << " " << cv_trace`,
      }),
    ]),
  );
  await run(page);
  await end(page);
  await expect(page.locator("#console")).toHaveText("città € 7 9 2\n");
  await expect(page.locator("#memory .cell")).toHaveCount(3);
  await expect(page.locator("#memory")).toContainText(prefix + "x");
  await expect(page.locator("#memory")).toContainText(prefix + "y");
});
test("200 variabili e durata degli ambiti", async ({ page }) => {
  await flow(page);
  await load(
    page,
    doc(
      Array.from({ length: 199 }, (_, i) => decl("v" + i, String(i))).concat(
        n("output", { expression: "v198" }),
      ),
    ),
  );
  await run(page);
  await end(page);
  await expect(page.locator("#console")).toHaveText("198\n");
  await expect(page.locator("#memory .cell")).toHaveCount(199);
  await load(
    page,
    doc(
      [
        decl("x", "1"),
        n("if", {
          condition: "true",
          then: [decl("x", "7"), n("output", { expression: "x" })],
          else: [],
        }),
        n("for", {
          init: "int i = 0",
          condition: "i < 2",
          update: "++i",
          body: [],
        }),
        n("output", { expression: "x" }),
      ],
      "cpp",
    ),
  );
  await run(page);
  await end(page);
  await expect(page.locator("#console")).toHaveText("7\n1\n");
  await expect(page.locator("#memory .cell")).toHaveCount(1);
});
test("diagnostica rimappata e azzerata, recupero dopo errore", async ({
  page,
}) => {
  await flow(page);
  await load(
    page,
    doc([
      decl("s"),
      n("assign", { expression: "s = manca" }),
      n("output", { expression: "s" }),
    ]),
  );
  await run(page);
  await expect(page.locator("#diagnostics")).toContainText("programma.cpp:9:");
  await expect(page.locator(".flow-selected")).not.toHaveCount(0);
  await load(
    page,
    doc([decl("dato", ""), n("output", { expression: "dato" })]),
  );
  await run(page);
  await expect(page.locator("#diagnostics")).toContainText(
    "prima dell’inizializzazione",
  );
  await expect(page.locator("#diagnostics")).not.toContainText("manca");
  await page
    .getByRole("button", { name: "Esempio somma", exact: true })
    .click();
  await run(page);
  await expect(page.locator("#status")).toHaveAttribute("data-error", "false");
});
test("input UTF-8, condizione valutata una volta, do/for/break/continue", async ({
  page,
}) => {
  await flow(page);
  await load(
    page,
    doc([
      decl("x", "1"),
      decl("s"),
      n("input", { target: "s", prompt: "Quantità: " }),
      n("if", {
        condition: "x++ == 1",
        then: [n("assign", { expression: "s += 1" })],
        else: [],
      }),
      n("do", {
        condition: "x < 3",
        body: [n("assign", { expression: "++x" })],
      }),
      n("for", {
        init: "int i = 0",
        condition: "i < 5",
        update: "++i",
        body: [
          n("if", { condition: "i == 1", then: [n("continue")], else: [] }),
          n("if", { condition: "i == 4", then: [n("break")], else: [] }),
          n("assign", { expression: "s += i" }),
        ],
      }),
      n("output", { expression: 's << " " << x' }),
    ]),
  );
  await page.locator("#input").fill("9");
  await run(page);
  await end(page);
  await expect(page.locator("#console")).toHaveText("Quantità: 15 3\n");
  await page.locator("#input").fill("");
  await run(page);
  await expect(page.locator("#status")).toContainText("Input esaurito");
  await expect(page.locator("#console")).toContainText("Quantità:");
});
test("trap, timeout e interruzione preservano la traccia", async ({ page }) => {
  const code = page.locator("#code");
  await code.fill(
    '#include <iostream>\nint main(){int x=1; OSSERVA(x);std::cout<<"prima"<<std::endl;int a[1]={0};volatile int i=10000000;std::cout<<a[i];}',
  );
  await run(page);
  await expect(page.locator("#status")).toContainText("Errore");
  await expect(page.locator("#console")).toContainText("prima");
  await expect(page.locator("#memory")).toContainText("1");
  await code.fill(
    '#include <iostream>\nint main(){int x=2; OSSERVA(x);std::cout<<"inizio"<<std::endl;volatile int i=0;while(true){i=1;}}',
  );
  await run(page);
  await expect(page.locator("#status")).toContainText("5 secondi");
  await expect(page.locator("#console")).toContainText("inizio");
  await page.locator("#run").click();
  await expect(page.locator("#status")).toContainText(
    "Esecuzione nel browser",
    { timeout: 95000 },
  );
  await page.locator("#stop").click();
  await expect(page.locator("#status")).toContainText("interrotta");
  await flow(page);
  await page.locator("#run").click();
  await page
    .getByRole("button", { name: "Modifica diagramma", exact: true })
    .click();
  await expect(page.locator("#run")).toBeEnabled();
  await expect(page.locator("#status")).toContainText("Puoi modificare");
});
test("limiti di traccia e output, HTML trattato come testo", async ({
  page,
}) => {
  await page
    .locator("#code")
    .fill("int main(){for(int i=0;i<1000;++i)OSSERVA(i);}");
  await run(page);
  await expect(page.locator("#status")).toContainText("800 osservazioni");
  await expect(page.locator("#timeline")).toBeEnabled();
  await page
    .locator("#code")
    .fill(
      '#include <iostream>\nint main(){for(int i=0;i<21000;++i)std::cout<<"x";std::cout.flush();}',
    );
  await run(page);
  await expect(page.locator("#status")).toContainText("20.000");
  await page
    .locator("#code")
    .fill(
      '#include <iostream>\nint main(){std::cout<<"<img src=x onerror=alert(1)>";}',
    );
  await run(page);
  await end(page);
  await expect(page.locator("#console img")).toHaveCount(0);
  await expect(page.locator("#console")).toContainText("<img");
});
test("bozze e modalità persistono; esportazione del sorgente", async ({
  page,
}) => {
  await page.locator("#code").fill("int main(){return 0;} // città");
  await page.locator("#input").fill("dati à");
  await flow(page);
  await expect(page).toHaveURL(/mode=flow/);
  await page.reload();
  await expect(page.locator("#mode-flow")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Codice C++", exact: true }).click();
  await expect(page.locator("#code")).toHaveValue(
    "int main(){return 0;} // città",
  );
  await expect(page.locator("#input")).toHaveValue("dati à");
  const pending = page.waitForEvent("download");
  await page.locator("#download-source").click();
  expect((await pending).suggestedFilename()).toBe("programma.cpp");
});
test.describe("accessibilità con script di verifica intercettato", () => {
  test.use({ serviceWorkers: "block" });
  test("accessibilità desktop/mobile e tastiera", async ({ page }) => {
    await page.route("**/__axe.js", async (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: await readFile(
          new URL("../node_modules/axe-core/axe.min.js", import.meta.url),
          "utf8",
        ),
      }),
    );
    await page.addScriptTag({ url: "/__axe.js" });
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 844 });
      for (const mode of ["Codice C++", "Flowchart"]) {
        await page.getByRole("button", { name: mode, exact: true }).click();
        const issues = await page.evaluate(
          async () =>
            (
              await axe.run(document, {
                runOnly: {
                  type: "tag",
                  values: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"],
                },
              })
            ).violations,
        );
        expect(issues).toEqual([]);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
    }
    await page
      .getByRole("button", {
        name: "Dichiarazione: int limite = 5",
        exact: true,
      })
      .focus();
    await page.keyboard.press("Space");
    await expect(
      page.getByRole("textbox", { name: "Nome variabile", exact: true }),
    ).toHaveValue("limite");
  });
});
test("offline dopo il primo uso", async ({ page, context }) => {
  await page.locator("#cpp-trace").selectOption("automatic");
  await run(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", resolve, {
          once: true,
        }),
      );
  });
  // First load may begin before the service worker controls the client.
  await run(page);
  await context.setOffline(true);
  try {
    await page.reload();
    await run(page);
    await end(page);
    await expect(page.locator("#console")).toHaveText("Somma = 15\n");
  } finally {
    await context.setOffline(false);
  }
});
test("memoria del programma limitata anche con memory.grow", async ({
  page,
}) => {
  await page
    .locator("#code")
    .fill(
      "#include <iostream>\nint main(){int esito=__builtin_wasm_memory_grow(0,1024);OSSERVA(esito);std::cout<<esito;}",
    );
  await run(page);
  await end(page);
  await expect(page.locator("#console")).toHaveText("-1");
});
test("salvataggio non disponibile: avviso e nessuna perdita silenziosa", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw Error("Quota esaurita");
    };
  });
  await page.reload();
  await expect(page.locator("#save-status")).toContainText(
    "Salvataggio locale non disponibile",
  );
  await page.locator("#code").fill("int main(){return 0;}");
  await page.locator("#mode-flow").click();
  await expect(page.locator("#save-status")).toContainText(
    "Salvataggio locale non disponibile",
  );
});
test.describe("verifica risorse senza cache di service worker", () => {
  test.use({ serviceWorkers: "block" });
  test("asset corrotto rifiutato prima di eseguire; recupero al tentativo successivo", async ({
    page,
  }) => {
    await page.route("**/toolchain/clang.wasm.gz", async (route) => {
      const bytes = gunzipSync(
        await readFile(new URL("../toolchain/clang.wasm.gz", import.meta.url)),
      );
      bytes[bytes.length - 1] ^= 1;
      await route.fulfill({
        contentType: "application/gzip",
        body: gzipSync(bytes),
      });
    });
    await run(page);
    await expect(page.locator("#status")).toContainText("Integrità");
    await expect(page.locator("#download")).toBeDisabled();
    await page.unroute("**/toolchain/clang.wasm.gz");
    await run(page);
    await end(page);
    await expect(page.locator("#console")).toHaveText("Somma = 15\n");
  });
});

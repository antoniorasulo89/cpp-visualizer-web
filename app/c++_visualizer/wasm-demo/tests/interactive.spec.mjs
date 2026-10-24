import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function until(page, destination) {
  for (let i = 0; i < 100; ++i) {
    await page.waitForFunction(
      () =>
        document.querySelector("#input-dialog").open ||
        !document.querySelector("#next").disabled ||
        !document.querySelector("#run").disabled,
      null,
      { timeout: 95000 },
    );
    const input = await page.locator("#input-dialog").evaluate((el) => el.open);
    const done = await page.locator("#run").isEnabled();
    if (destination === "input" && input) return;
    if (destination === "done" && done) return;
    if (input || done) throw Error(await page.locator("#status").innerText());
    await page.locator("#next").click();
  }
  throw Error("Troppi passi senza raggiungere " + destination);
}
async function start(page, source) {
  await page.goto("/wasm-demo/");
  await expect(page.locator("#input-mode")).toHaveValue("interactive");
  await expect(page.locator("#input")).toBeHidden();
  await page.locator("#code").fill(source);
  await page.locator("#run").click();
}
async function answer(page, value) {
  await page.locator("#input-value").fill(value);
  await page.locator("#input-value").press("Enter");
  await expect(page.locator("#input-dialog")).not.toBeVisible();
  await expect(page.locator("#next")).toBeEnabled();
}

test("C++: pausa reale, nessuna riesecuzione, input concatenati e trasferimento", async ({
  page,
}) => {
  await start(
    page,
    '#include <iostream>\nint main(){int n=0;std::cout<<++n<<"?";int x;double y;std::cin>>x>>y;int s=x+1;double d=y*2;std::cout<<n<<" "<<s<<" "<<d;}',
  );
  await until(page, "input");
  await expect(page.locator("#input-question")).toHaveText("Valore per x");
  await expect(page.locator("#input-value")).toBeFocused();
  await expect(page.locator("#console")).toHaveText("1?");
  const snapshot = await page.locator("#memory").textContent();
  await page.waitForTimeout(6100); // The execution budget must exclude human input.
  await expect(page.locator("#run")).toBeDisabled();
  await expect(page.locator("#input-dialog")).toBeVisible();
  await expect(page.locator("#memory")).toHaveText(snapshot);
  await page.locator("#input-value").fill("1.5");
  await page.locator("#input-value").press("Enter");
  await expect(page.locator("#input-error")).toContainText("intero");
  await expect(page.locator("#input-dialog")).toBeVisible();
  await answer(page, "5");
  await expect(page.locator('[data-variable="x"].input-arrived')).toHaveCount(
    1,
  );
  await until(page, "input");
  await expect(page.locator("#input-question")).toHaveText("Valore per y");
  await answer(page, "2.5");
  await expect(page.locator('[data-variable="y"].input-arrived')).toHaveCount(
    1,
  );
  await until(page, "done");
  await expect(page.locator("#console")).toHaveText("1?5\n2.5\n1 6 5");
  await expect(page.locator("#status")).toContainText("Compilato ed eseguito");
  await page.locator("#timeline").focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("End");
  await expect(page.locator("#console")).toHaveText("1?5\n2.5\n1 6 5");
  await expect(page.locator("#input-dialog")).not.toBeVisible();
});

test("flowchart: input multilinea, passi reali e valori nelle celle", async ({
  page,
}) => {
  await page.goto("/wasm-demo/?mode=flow");
  const body = [
    {
      id: "read",
      kind: "input",
      target: "int base\naltezza",
      prompt: "Dimensioni",
    },
    { id: "calc", kind: "assign", expression: "area = base * altezza" },
    { id: "out", kind: "output", expression: "area", ending: "OUTLN" },
  ];
  await page.locator('#flow-pane input[type="file"]').setInputFiles({
    name: "input.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        format: "dentro-il-codice-flowchart",
        version: 3,
        functions: [
          { id: "main", name: "main", returnType: "int", params: [], body },
        ],
      }),
    ),
  });
  await page.locator("#run").click();
  await until(page, "input");
  await expect(page.locator("#input-question")).toContainText("base");
  await expect(page.locator(".flow-active")).toHaveCount(1);
  await answer(page, "4");
  await expect(
    page.locator('[data-variable="base"].input-arrived'),
  ).toHaveCount(1);
  await until(page, "input");
  await expect(page.locator("#input-question")).toContainText("altezza");
  await answer(page, "6");
  await until(page, "done");
  await expect(page.locator("#console")).toContainText("24\n");
  await expect(page.locator('[data-variable="area"]')).toContainText("24");
});

test("array, getline UTF-8 e newline conservano la semantica C++", async ({
  page,
}) => {
  await start(
    page,
    '#include <iostream>\n#include <string>\nint main(){int a[2]={0,0};std::cin>>a[1];std::string skip;std::getline(std::cin,skip);std::string nome;std::getline(std::cin,nome);std::cout<<a[1]<<":"<<skip<<":"<<nome;}',
  );
  await until(page, "input");
  await expect(page.locator("#input-question")).toHaveText("Valore per a[1]");
  await answer(page, "7");
  await expect(page.locator('[data-variable="a"].input-arrived')).toHaveCount(
    1,
  );
  await until(page, "input");
  await expect(page.locator("#input-question")).toHaveText("Valore per nome");
  await answer(page, "città con spazi");
  await until(page, "done");
  await expect(page.locator("#console")).toHaveText(
    "7\ncittà con spazi\n7::città con spazi",
  );
});

test("EOF in una condizione termina il ciclo senza chiedere un altro dato", async ({
  page,
}) => {
  await start(
    page,
    "#include <iostream>\nint main(){int x;int s=0;while(std::cin>>x)s+=x;std::cout<<s;}",
  );
  await until(page, "input");
  await answer(page, "9");
  await until(page, "input");
  await page.locator("#input-eof").click();
  await expect(page.locator("#input-dialog")).not.toBeVisible();
  await until(page, "done");
  await expect(page.locator("#console")).toHaveText("9\n9");
  await expect(page.locator("#status")).toContainText("Compilato ed eseguito");
});

test("input in subroutine: stack e variabile passata per riferimento restano coerenti", async ({
  page,
}) => {
  await start(
    page,
    "#include <iostream>\nvoid leggi(int &v){std::cin>>v;}\nint main(){int x;int n=1;leggi(x);n+=x;std::cout<<n;}",
  );
  await until(page, "input");
  await expect(page.locator("#input-question")).toContainText("leggi#1 · v");
  await answer(page, "8");
  await expect(
    page.locator('[data-variable="leggi#1 · v"].input-arrived'),
  ).toHaveCount(1);
  await until(page, "done");
  await expect(page.locator("#console")).toHaveText("8\n9");
  await expect(page.locator('[data-variable="x"]')).toContainText("8");
  await expect(page.locator('[data-variable="leggi#1 · v"]')).toHaveCount(0);
});

test("Esc interrompe, conserva la traccia e permette un nuovo avvio", async ({
  page,
}) => {
  await start(
    page,
    '#include <iostream>\nint main(){int n=3;std::cout<<"pronto";int x;std::cin>>x;std::cout<<"dopo";}',
  );
  await until(page, "input");
  await page.keyboard.press("Escape");
  await expect(page.locator("#run")).toBeEnabled();
  await expect(page.locator("#console")).toHaveText("pronto");
  await expect(page.locator("#memory")).toContainText("3");
  await expect(page.locator(".input-flight")).toHaveCount(0);
  await page.locator("#run").click();
  await until(page, "input");
  await answer(page, "2");
  await until(page, "done");
  await expect(page.locator("#console")).toHaveText("pronto2\ndopo");
});

test("movimento ridotto: evidenziazione immediata, senza valore volante", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await start(
    page,
    "#include <iostream>\nint main(){int x;std::cin>>x;std::cout<<x;}",
  );
  await until(page, "input");
  await answer(page, "12");
  await expect(page.locator(".input-flight")).toHaveCount(0);
  await expect(page.locator('[data-variable="x"].input-arrived')).toHaveCount(
    1,
  );
  await until(page, "done");
});

test("Riproduci esegue i passi e si ferma sull'input, poi riprende automaticamente", async ({
  page,
}) => {
  await start(
    page,
    "#include <iostream>\nint main(){int n=1;n+=2;int x;std::cin>>x;n+=x;std::cout<<n;}",
  );
  await expect(page.locator("#next")).toBeEnabled({ timeout: 95000 });
  await page.locator("#speed").selectOption("8");
  await page.locator("#play").click();
  await expect(page.locator("#input-dialog")).toBeVisible();
  await expect(page.locator("#play")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#console")).not.toContainText("7");
  await answer(page, "4");
  await expect(page.locator(".input-flight")).toBeVisible();
  await expect(page.locator("#play")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#run")).toBeDisabled();
  await expect(page.locator("#run")).toBeEnabled();
  await expect(page.locator("#console")).toHaveText("4\n7");
});

test("input preparato resta disponibile e la scelta viene salvata", async ({
  page,
}) => {
  await page.goto("/wasm-demo/");
  await page.locator("#input-mode").selectOption("prepared");
  await page.locator("#input").fill("5 2.5");
  await page
    .locator("#code")
    .fill(
      "#include <iostream>\nint main(){int x;double y;std::cin>>x>>y;std::cout<<x+y;}",
    );
  await page.reload();
  await expect(page.locator("#input-mode")).toHaveValue("prepared");
  await page.locator("#run").click();
  await expect(page.locator("#run")).toBeEnabled({ timeout: 95000 });
  await page.locator("#timeline").focus();
  await page.keyboard.press("End");
  await expect(page.locator("#console")).toHaveText("7.5");
  await expect(page.locator("#input-dialog")).not.toBeVisible();
});

test("modalità manuale: stdin si sospende anche senza metadati automatici", async ({
  page,
}) => {
  await page.goto("/wasm-demo/");
  await page.locator("#cpp-trace").selectOption("manual");
  await page
    .locator("#code")
    .fill(
      '#include <iostream>\nint main(){int x;std::cout<<"dato?";std::cin>>x;OSSERVA(x);std::cout<<x;}',
    );
  await page.locator("#run").click();
  await until(page, "input");
  await expect(page.locator("#input-question")).toHaveText(
    "Input del programma",
  );
  await expect(page.locator("#input-prompt")).toHaveText("dato?");
  await page.locator("#input-value").fill("8");
  await page.locator("#input-dialog [type=submit]").click();
  await expect(page.locator("#run")).toBeEnabled({ timeout: 95000 });
  await expect(page.locator("#console")).toHaveText("dato?8\n8");
  await expect(page.locator('[data-variable="x"]')).toContainText("8");
});

test("motore interattivo disponibile offline dopo il primo utilizzo", async ({
  page,
  context,
}) => {
  await start(
    page,
    "#include <iostream>\nint main(){int x;std::cin>>x;std::cout<<x;}",
  );
  await until(page, "input");
  await answer(page, "4");
  await until(page, "done");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", resolve, {
          once: true,
        }),
      );
  });
  // Warm the binary cache with a controlled Worker, then verify a cold reload.
  await page.locator("#run").click();
  await until(page, "input");
  await answer(page, "5");
  await until(page, "done");
  await context.setOffline(true);
  try {
    await page.reload();
    await page.locator("#run").click();
    await until(page, "input");
    await answer(page, "6");
    await until(page, "done");
    await expect(page.locator("#console")).toHaveText("6\n6");
  } finally {
    await context.setOffline(false);
  }
});

test.describe("accessibilità del dialogo senza intercettazione del service worker", () => {
  test.use({ serviceWorkers: "block" });
  test("dialogo accessibile e senza overflow nelle quattro skin, desktop e mobile", async ({
    page,
  }, info) => {
    await page.goto("/wasm-demo/");
    const axe = await readFile(
      new URL("../node_modules/axe-core/axe.min.js", import.meta.url),
      "utf8",
    );
    await page.route("**/__axe.js", (r) =>
      r.fulfill({ contentType: "application/javascript", body: axe }),
    );
    await page.addScriptTag({ url: "/__axe.js" });
    await page
      .locator("#code")
      .fill(
        '#include <iostream>\nint main(){int numero;std::cout<<"Inserisci un numero intero";std::cin>>numero;}',
      );
    for (const skin of ["laboratorio", "mappa", "segnali", "classica"]) {
      await page.locator(".settings-link").click();
      await page.locator(`#settings input[value="${skin}"]`).check();
      await page.locator(".settings-link").click();
      await page.locator("#run").click();
      await until(page, "input");
      for (const width of [375, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const box = await page.locator("#input-dialog").boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
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
        await page.screenshot({
          path: info.outputPath(`input-${skin}-${width}.png`),
          fullPage: true,
        });
      }
      await page.keyboard.press("Escape");
      await expect(page.locator("#run")).toBeEnabled();
    }
  });
});

import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function run(page) {
  await page.locator("#run").click();
  await expect(page.locator("#run")).toBeEnabled({ timeout: 95000 });
  expect(await page.locator("#status").textContent()).toContain(
    "Compilato ed eseguito",
  );
  await page.locator("#timeline").focus();
  await page.keyboard.press("End");
}
async function load(page, body, extra = {}) {
  await page.locator('#flow-pane input[type="file"]').setInputFiles({
    name: "lesson.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        format: "dentro-il-codice-flowchart",
        version: 3,
        functions: [
          { id: "main", name: "main", returnType: "int", params: [], body },
        ],
        ...extra,
      }),
    ),
  });
}
let serial = 0;
const n = (kind, fields = {}) => ({ id: "new" + ++serial, kind, ...fields });
test.beforeEach(async ({ page }) => {
  await page.goto("/wasm-demo/");
  await page.locator("#cpp-trace").selectOption("manual");
});

test("importazione Clang WASM: funzioni, riferimenti, array, puntatori, stringhe e ambiti C++", async ({
  page,
}) => {
  const source = `#include <iostream>
#include <string>
int area(int b,int h){return b*h;}
void aumenta(int &x){x+=1;}
int main(){int n=2; int a=area(n,3); aumenta(a); int v[3]={1,2,3}; int j=0; v[j++]+=a; int *p=&n; *p=4; std::string nome="città"; for(int i=0;i<2;++i){int n=i; std::cout<<n;} std::cout<<" "<<a<<" "<<v[0]<<" "<<n<<" "<<nome<<std::endl; return 0;}`;
  await page.locator("#code").fill(source);
  await page.locator("#cpp-to-flow").click();
  await expect(page.locator("#cpp-to-flow")).toBeEnabled({ timeout: 95000 });
  await expect(page.locator("#mode-flow")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator("#mode-cpp").click();
  await expect(page.locator("#code")).toHaveValue(source);
  await page.locator("#mode-flow").click();
  await run(page);
  await expect(page.locator("#console")).toHaveText("01 7 8 4 città\n");
  await expect(page.locator("#memory")).toContainText("[8, 2, 3]");
  await page.locator("#timeline").focus();
  await page.keyboard.press("Home");
  for (let i = 0; i < 7; i++) await page.locator("#next").click();
  await expect(page.locator(".flow-active")).toHaveCount(1);
});

test("sintassi AlgoBuild: input e assegnamenti multilinea, OUT, tipi e durata", async ({
  page,
}) => {
  await page.locator("#mode-flow").click();
  await load(page, [
    n("input", { target: "int base\naltezza", prompt: "" }),
    n("assign", { expression: "area = base * altezza\ni = 0" }),
    n("if", {
      condition: "base > 0",
      then: [
        n("assign", { expression: 'messaggio = "città"\ncreata = area + 1' }),
      ],
      else: [],
    }),
    n("for", {
      init: "i = 0",
      condition: "i < 2",
      update: "++i",
      body: [n("assign", { expression: "creata += i" })],
    }),
    n("output", { expression: 'messaggio\n" "', ending: "OUT" }),
    n("output", { expression: 'area\n" "\ncreata\n" "\ni', ending: "OUTLN" }),
  ]);
  await page.locator("#input").fill("4 6");
  await run(page);
  await expect(page.locator("#console")).toHaveText("città 24 26 2\n");
  await expect(page.locator("#memory")).toContainText("messaggio");
  await expect(page.locator("#memory")).toContainText("città");
});

test("importazione rifiutata senza perdita e letture prima della creazione controllate", async ({
  page,
}) => {
  await page
    .locator("#code")
    .fill("int globale=1; int main(){return globale;}");
  await page.locator("#cpp-to-flow").click();
  await expect(page.locator("#cpp-to-flow")).toBeEnabled({ timeout: 95000 });
  await expect(page.locator("#status")).toContainText("Globali");
  await expect(page.locator("#mode-cpp")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator("#mode-flow").click();
  await load(page, [
    n("if", {
      condition: "false",
      then: [n("assign", { expression: "x = 3" })],
      else: [],
    }),
    n("output", { expression: "x", ending: "OUTLN" }),
  ]);
  await page.locator("#run").click();
  await expect(page.locator("#run")).toBeEnabled({ timeout: 95000 });
  await expect(page.locator("#status")).toContainText(
    "prima dell’inizializzazione",
  );
  await expect(page.locator("#timeline")).toBeEnabled();
});

test("menu frecce, PNG completo e riproduzione con velocità persistente", async ({
  page,
}) => {
  await page.locator("#mode-flow").click();
  await page.locator(".flow-insert-handle").first().click();
  await expect(
    page.getByRole("menuitem", { name: "FOR", exact: true }),
  ).toBeVisible();
  await page.getByRole("menuitem", { name: "FOR", exact: true }).click();
  await expect(page.locator(".flow-node.for")).toHaveCount(1);
  await page.getByRole("button", { name: "Annulla", exact: true }).click();
  const download = page.waitForEvent("download", { timeout: 10000 });
  await page.getByRole("button", { name: "Esporta PNG", exact: true }).click();
  const bytes = await readFile(await (await download).path());
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(bytes.readUInt32BE(16)).toBeGreaterThan(400);
  await run(page);
  await page.locator("#timeline").focus();
  await page.keyboard.press("Home");
  await page.locator("#speed").selectOption("8");
  await page.locator("#play").click();
  await expect(page.locator("#timeline")).not.toHaveValue("0");
  await page.locator("#speed").selectOption("4");
  await page.locator("#play").click();
  await expect(page.locator("#play")).toHaveText("Riproduci");
  await page.reload();
  await expect(page.locator("#speed")).toHaveValue("4");
});

test("inizializzazione per cella e indici con effetti valutati una volta", async ({
  page,
}) => {
  await page
    .locator("#code")
    .fill(
      '#include <iostream>\nint main(){int a[2]; a[1]=7; a[1]+=2; int i=0;std::cin>>a[i++];std::cout<<i<<" "<<a[0]<<" "<<a[1]<<std::endl;return 0;}',
    );
  await page.locator("#cpp-to-flow").click();
  await expect(page.locator("#cpp-to-flow")).toBeEnabled({ timeout: 95000 });
  await expect(page.locator("#mode-flow")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator("#input").fill("5");
  await run(page);
  await expect(page.locator("#console")).toHaveText("1 5 9\n");
  await expect(page.locator("#memory")).toContainText("[5, 9]");
});

test("stringhe non create e dichiarazioni differite senza inizializzazione", async ({
  page,
}) => {
  await page.locator("#mode-flow").click();
  await load(page, [
    n("if", {
      condition: "false",
      then: [n("assign", { expression: 's = "segreto"' })],
      else: [],
    }),
    n("output", { expression: "s", ending: "OUTLN" }),
  ]);
  await page.locator("#run").click();
  await expect(page.locator("#run")).toBeEnabled({ timeout: 95000 });
  await expect(page.locator("#status")).toContainText(
    "prima dell’inizializzazione",
  );
  await load(page, [
    n("if", {
      condition: "true",
      then: [
        n("declare", {
          name: "dato",
          type: "int",
          mode: "value",
          init: "",
          size: "",
          constant: false,
        }),
      ],
      else: [],
    }),
  ]);
  await run(page);
  await expect(page.locator("#memory")).toContainText("dato");
  await expect(page.locator("#memory")).toContainText("?");
});

test("getline importato, UTF-8 e annullamento conservano il sorgente", async ({
  page,
}) => {
  const source =
    '#include <iostream>\n#include <string>\nint main(){std::string nome;std::getline(std::cin,nome);int numero;std::cin>>numero;std::cout<<nome<<":"<<numero<<std::endl;return 0;}';
  await page.locator("#code").fill(source);
  await page.locator("#input").fill("Città larga\n7");
  await page.locator("#cpp-to-flow").click();
  await expect(page.locator("#cpp-to-flow")).toBeEnabled({ timeout: 95000 });
  await expect(page.locator("#mode-flow")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await run(page);
  await expect(page.locator("#console")).toHaveText("Città larga:7\n");
  await page.getByRole("button", { name: "Annulla", exact: true }).click();
  await expect(page.locator(".flow-canvas")).toContainText("int limite = 5");
  await page.locator("#mode-cpp").click();
  await expect(page.locator("#code")).toHaveValue(source);
});

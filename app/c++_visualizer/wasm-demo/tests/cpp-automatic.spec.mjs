import { test, expect } from "@playwright/test";

const lesson = `#include <iostream>
using namespace std;

int main() {
    int x, s;
    double y, d;
    cout<<"Inserisci un numero intero: ";
    cin>>x;
    cout<<"Inserisci un numero reale: ";
    cin>>y;
    s=x+1;
    d=y*2;
    cout<<"Il successivo di "<<x<<" è "<<s<<endl;
    cout<<"Il doppio di "<<y<<" è "<<d<<endl;
}`;

async function run(page, source, input = "") {
  await page.locator("#code").fill(source);
  await page.locator("#input").fill(input);
  await page.locator("#run").click();
  await expect(page.locator("#run")).toBeEnabled({ timeout: 95000 });
}
async function end(page) {
  await page.locator("#timeline").focus();
  await page.keyboard.press("End");
}
test.beforeEach(async ({ page }) => {
  await page.goto("/wasm-demo/");
});

test("C++ senza OSSERVA: input, dichiarazioni multiple, valori e output a ogni istruzione", async ({
  page,
}) => {
  await expect(page.locator("#cpp-trace")).toHaveValue("automatic");
  await run(page, lesson, "5 2.5");
  await expect(page.locator("#status")).toContainText("Compilato ed eseguito");
  const snapshots = [];
  const last = Number(await page.locator("#timeline").getAttribute("max"));
  for (let i = 0; i <= last; i++) {
    snapshots.push({
      event: await page.locator("#event").textContent(),
      values: await page.locator("#memory").innerText(),
      output: await page.locator("#console").textContent(),
    });
    if (i < last) await page.locator("#next").click();
  }
  const at = (line) =>
    snapshots.find((s) => s.event.startsWith(`Riga ${line} ·`));
  expect(at(5).values).toMatch(/x\s*\?/);
  expect(at(5).values).toMatch(/s\s*\?/);
  expect(at(8).values).toMatch(/x\s*5/);
  expect(at(8).values).toMatch(/y\s*\?/);
  expect(at(10).values).toMatch(/y\s*2\.5/);
  expect(at(11).values).toMatch(/s\s*6/);
  expect(at(11).values).toMatch(/d\s*\?/);
  expect(at(12).values).toMatch(/d\s*5/);
  expect(at(13).output).toContain("Il successivo di 5 è 6\n");
  expect(at(13).output).not.toContain("Il doppio");
  expect(snapshots.at(-1).output).toBe(
    "Inserisci un numero intero: Inserisci un numero reale: Il successivo di 5 è 6\nIl doppio di 2.5 è 5\n",
  );
  expect(snapshots.every((s) => !s.event.includes("null"))).toBe(true);
  await expect(page.locator("#code")).toHaveValue(lesson);
  await page.reload();
  await expect(page.locator("#cpp-trace")).toHaveValue("automatic");
  await expect(page.locator("#code")).toHaveValue(lesson);
});

test("corpi senza graffe, else, break, continue e ambiti restano semanticamente equivalenti", async ({
  page,
}) => {
  await run(
    page,
    '#include <iostream>\nint main(){int s=0;for(int i=0;i<5;++i)if(i==2)continue;else s+=i;int j=0;while(j<5)if(++j==3)break;else s+=j;do --s;while(s>10);std::cout<<s<<" "<<j;}',
    "",
  );
  await expect(page.locator("#status")).toContainText("Compilato ed eseguito");
  await end(page);
  await expect(page.locator("#console")).toHaveText("10 3");
  await expect(page.locator("#memory")).not.toContainText("i");
});

test("input mancante e lettura non inizializzata conservano sorgente e passi già prodotti", async ({
  page,
}) => {
  await run(page, lesson, "5");
  await expect(page.locator("#status")).toContainText("Input esaurito");
  await expect(page.locator("#code")).toHaveValue(lesson);
  await expect(page.locator("#console")).toContainText(
    "Inserisci un numero reale",
  );
  await run(page, "#include <iostream>\nint main(){int x;std::cout<<x;}");
  await expect(page.locator("#status")).toContainText(
    "prima dell’inizializzazione",
  );
});

test("C++23 reale nella compilazione e nell’AST, con modalità manuale persistente per codice avanzato", async ({
  page,
}) => {
  // The z suffix requires C++23 and is accepted by the import AST as well.
  const automatic = "#include <iostream>\nint main(){int x=1z;std::cout<<x;}";
  await run(page, automatic);
  await expect(page.locator("#status")).toContainText("Compilato ed eseguito");
  await page.locator("#cpp-to-flow").click();
  await expect(page.locator("#cpp-to-flow")).toBeEnabled({ timeout: 95000 });
  await expect(page.locator("#mode-flow")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator("#run").click();
  await expect(page.locator("#run")).toBeEnabled({ timeout: 95000 });
  await expect(page.locator("#status")).toContainText("Compilato ed eseguito");
  await end(page);
  await expect(page.locator("#console")).toHaveText("1");
  await page.locator("#mode-cpp").click();
  await page.locator("#cpp-trace").selectOption("manual");
  await run(
    page,
    "#include <iostream>\n#include <span>\nconsteval int f(){if consteval{return 7;}else{return 0;}}\nint main(){static_assert(__cplusplus>=202302L);int a[]={f(),8};std::span<int> s(a);OSSERVA(a[0]);std::cout<<s[0]+s[1];}",
  );
  await expect(page.locator("#status")).toContainText("Compilato ed eseguito");
  await end(page);
  await expect(page.locator("#console")).toHaveText("15");
  await page.reload();
  await expect(page.locator("#cpp-trace")).toHaveValue("manual");
});

test("costrutti non supportati spiegano come usare il tracciamento manuale", async ({
  page,
}) => {
  const source =
    "#include <iostream>\nint global=4;int main(){std::cout<<global;}";
  await run(page, source);
  await expect(page.locator("#status")).toContainText("Manuale (OSSERVA)");
  await expect(page.locator("#code")).toHaveValue(source);
  await page.locator("#cpp-trace").selectOption("manual");
  await run(page, source);
  await expect(page.locator("#status")).toContainText("Compilato ed eseguito");
  await end(page);
  await expect(page.locator("#console")).toHaveText("4");
});

test("punti e virgola dopo commenti, OSSERVA preesistenti e dichiarazioni dipendenti", async ({
  page,
}) => {
  await run(
    page,
    "#include <iostream>\nint main(){int x=1 /* primo */\n; OSSERVA(x);if(x) x++ // incremento\n;else x=9;std::cout<<x;}",
  );
  await expect(page.locator("#status")).toContainText("Compilato ed eseguito");
  await end(page);
  await expect(page.locator("#console")).toHaveText("2");
  await run(page, "int main(){int x, y=(x=2);}");
  await expect(page.locator("#status")).toContainText(
    "separa le dichiarazioni",
  );
  await run(page, "#include <vector>\nint main(){std::vector<int> a{1};}");
  await expect(page.locator("#status")).toContainText("Manuale (OSSERVA)");
});

test("automatico conserva parametri per riferimento, array, stringhe e ambiti", async ({
  page,
}) => {
  await run(
    page,
    "#include <iostream>\n#include <string>\nvoid set(int& v){v=7;} int main(){int x;set(x);int a[2];a[0]=x;{int x=9;std::cout<<x;}std::string s;getline(std::cin,s);std::cout<<a[0]<<s;}",
    "ciao",
  );
  await expect(page.locator("#status")).toContainText("Compilato ed eseguito");
  await end(page);
  await expect(page.locator("#console")).toHaveText("97ciao");
  await expect(page.locator("#memory")).toContainText("[7, ?]");
  await expect(page.locator("#memory")).toContainText("ciao");
});

import { test, expect } from "@playwright/test";

// Compare actual programs with the same compiler, then inspect intermediate
// states as well as stdout: matching final output alone missed the alias bug.
async function compare(page, source, input = "") {
  return page.evaluate(
    async ({ source, input }) => {
      const execute = (data) =>
        new Promise((resolve, reject) => {
          const worker = new Worker("worker.js", { type: "module" });
          const timer = setTimeout(() => {
            worker.terminate();
            reject(Error("Worker timeout"));
          }, 95000);
          worker.onerror = (e) => {
            clearTimeout(timer);
            worker.terminate();
            reject(Error(e.message));
          };
          worker.onmessage = ({ data }) => {
            if (!["done", "error", "imported"].includes(data.type)) return;
            clearTimeout(timer);
            worker.terminate();
            delete data.wasm;
            resolve(data);
          };
          worker.postMessage(data);
        });
      const raw = await execute({ code: source, input, flow: false });
      const imported = await execute({
        action: "import",
        code: source,
        input: "",
      });
      if (imported.type !== "imported") return { raw, flow: imported };
      const generated = FlowchartWasm.generate(
        FlowchartCore.validate(imported.document),
      );
      const flow = await execute({
        code: generated.code,
        input,
        flow: true,
        lineMap: generated.lineMap,
        flowInfo: generated.flow,
      });
      return { raw, flow };
    },
    { source, input },
  );
}
function succeeded(result, output) {
  expect(result.raw.type, result.raw.text || result.raw.log).toBe("done");
  expect(result.flow.type, result.flow.text || result.flow.log).toBe("done");
  expect(result.raw.states.at(-1).output).toBe(output);
  expect(result.flow.states.at(-1).output).toBe(output);
}
test.beforeEach(async ({ page }) => {
  await page.goto("/wasm-demo/?input=prepared");
  await page.locator("#cpp-trace").selectOption("manual");
});

test("F1: alias e parametri condividono l’inizializzazione senza leggere dati ignoti", async ({
  page,
}) => {
  const result = await compare(
    page,
    "#include <iostream>\nvoid set(int &v){v=5;}int main(){int x;int &r=x;set(r);int a[2];set(a[1]);std::cout<<x<<r<<a[1]<<std::endl;return 0;}",
  );
  succeeded(result, "555\n");
  const states = result.flow.states;
  expect(states.some((s) => s.values.r === "?")).toBe(true);
  const entries = states.filter((s) =>
    Object.keys(s.values).some((k) => /set#.*v$/.test(k)),
  );
  expect(
    entries.some((s) =>
      Object.entries(s.values).some(
        ([k, v]) => /set#.*v$/.test(k) && v === "?",
      ),
    ),
  ).toBe(true);
  for (const state of states)
    for (const [name, value] of Object.entries(state.values)) {
      if (name === "x" || name === "r" || /set#.*v$/.test(name))
        expect(["?", 5]).toContain(value);
    }
  expect(states.some((s) => s.values.a === "[?, 5]")).toBe(true);
});

test("F2: prefisso lvalue, postfisso e indici valutati una volta", async ({
  page,
}) => {
  const result = await compare(
    page,
    '#include <iostream>\nvoid f(int &v){v+=10;}int main(){int x=1;f(++x);int &r=--x;r+=2;int p=x++;int q=x--;int a[2]={4,5};int i=0;int prior=a[i++]++;int &at=++a[i++];at+=4;std::cout<<x<<" "<<p<<" "<<q<<" "<<prior<<" "<<i<<" "<<a[0]<<" "<<a[1]<<std::endl;return 0;}',
  );
  succeeded(result, "13 13 14 4 2 5 10\n");
});

test("F3: DO e IF/ELSE annidati non estendono l’ambito del FOR", async ({
  page,
}) => {
  const result = await compare(
    page,
    '#include <iostream>\nint main(){int x=0;for(int i=0;i<2;++i){do{if(i==0){x++;}else{x+=2;}}while(false);}int i=9;for(int j=0;j<1;++j){for(int k=0;k<1;++k){do{x++;}while(false);}}int j=8;int k=7;std::cout<<x<<" "<<i<<" "<<j<<" "<<k<<std::endl;return 0;}',
  );
  succeeded(result, "4 9 8 7\n");
  const after = result.flow.states.find((s) => s.values.i === 9);
  expect(after.values.x).toBe(3);
  expect(result.flow.states.at(-1).values).toMatchObject({
    x: 4,
    i: 9,
    j: 8,
    k: 7,
  });
});

test("F4: hook testuale manuale respinto e budget JS applicato alla traccia reale", async ({
  page,
}) => {
  await page
    .locator("#code")
    .fill(
      "#include <string>\nint main(){std::string value(4090,'x');for(int i=0;i<1100;++i){std::string name=\"v\"+std::to_string(i);__cv_text(1,name.c_str(),value.data(),value.size());}return 0;}",
    );
  await page.locator("#run").click();
  await expect(page.locator("#run")).toBeEnabled({ timeout: 95000 });
  await expect(page.locator("#status")).toContainText(
    "riservate al tracciamento automatico",
  );
  const source =
    "#include <iostream>\n#include <string>\nint main(){" +
    Array.from({ length: 80 }, (_, i) => `std::string v${i}(4090,'x');`).join(
      "",
    ) +
    "return 0;}";
  const result = await compare(page, source);
  expect(result.raw.type).toBe("done");
  expect(result.flow.type).toBe("error");
  expect(result.flow.text).toContain("8 MB");
  expect(JSON.stringify(result.flow.states).length * 2).toBeLessThanOrEqual(
    8 * 1024 * 1024,
  );
  // Deliberately bypass the generated C++ Watch class, as an untrusted module
  // can. The JS boundary must still reject excess keys and invalid byte ranges.
  const attacks = await page.evaluate(async () => {
    const execute = (code) =>
      new Promise((resolve, reject) => {
        const w = new Worker("worker.js", { type: "module" });
        const timer = setTimeout(() => {
          w.terminate();
          reject(Error("timeout"));
        }, 95000);
        w.onerror = (e) => {
          clearTimeout(timer);
          w.terminate();
          reject(Error(e.message));
        };
        w.onmessage = ({ data }) => {
          if (!["done", "error"].includes(data.type)) return;
          clearTimeout(timer);
          w.terminate();
          resolve({ type: data.type, text: data.text });
        };
        w.postMessage({
          code,
          input: "",
          flow: true,
          lineMap: [],
          flowInfo: {},
        });
      });
    const prefix =
      'extern "C" void __cv_text(int,const char*,const char*,unsigned);\nint main(){';
    const keys = await execute(
      prefix +
        Array.from(
          { length: 201 },
          (_, i) => `__cv_text(1,"v${i}","x",1);`,
        ).join("") +
        "return 0;}",
    );
    const range = await execute(
      prefix + '__cv_text(1,"n","x",4097);return 0;}',
    );
    return { keys, range };
  });
  expect(attacks.keys).toMatchObject({
    type: "error",
    text: expect.stringContaining("200 variabili"),
  });
  expect(attacks.range).toMatchObject({
    type: "error",
    text: expect.stringContaining("4096 byte"),
  });
});

test("F5: EOF condizionale termina normalmente; INPUT obbligatorio segnala i dati mancanti", async ({
  page,
}) => {
  succeeded(
    await compare(
      page,
      '#include <iostream>\nint main(){int x;while(std::cin>>x){std::cout<<x;}std::cout<<" fine";return 0;}',
      "1 2",
    ),
    "12 fine",
  );
  succeeded(
    await compare(
      page,
      '#include <iostream>\n#include <string>\nint main(){std::string s;while(std::getline(std::cin,s)){std::cout<<s<<":";}return 0;}',
      "città\nblu",
    ),
    "città:blu:",
  );
  const required = await compare(
    page,
    "#include <iostream>\nint main(){int x;std::cin>>x;return 0;}",
  );
  expect(required.flow.type).toBe("error");
  expect(required.flow.text).toContain("Input esaurito");
});

test("F6: FOR string e dichiarazioni multiple osservate tramite AST", async ({
  page,
}) => {
  const result = await compare(
    page,
    '#include <iostream>\n#include <string>\nint main(){for(std::string s="x";s.size()<3;s+="x"){std::cout<<s;}std::string s="fine";for(int i=0,j=i+1;i<2;++i){std::cout<<j;}std::cout<<s<<std::endl;return 0;}',
  );
  succeeded(result, "xxx11fine\n");
  expect(result.flow.states.some((s) => s.values.s === "xx")).toBe(true);
  expect(result.flow.states.at(-1).values.s).toBe("fine");
  expect(result.flow.states.at(-1).values).not.toHaveProperty("i");
});

test("F7: puntatori multipli in variabili e parametri rifiutati prima di sostituire il lavoro", async ({
  page,
}) => {
  await page.locator("#mode-flow").click();
  const diagram = await page.locator(".flow-canvas").textContent();
  await page.locator("#mode-cpp").click();
  for (const source of [
    "int main(){int x=1;int *p=&x;int **q=&p;**q=5;return 0;}",
    "void f(int **p){} int main(){return 0;}",
    "int main(){int x=1;int *p=&x;int *&q=p;return 0;}",
  ]) {
    await page.locator("#code").fill(source);
    await page.locator("#cpp-to-flow").click();
    await expect(page.locator("#cpp-to-flow")).toBeEnabled({ timeout: 95000 });
    await expect(page.locator("#status")).toContainText(
      "Tipo non rappresentabile",
    );
    await expect(page.locator("#mode-cpp")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator("#code")).toHaveValue(source);
    await page.locator("#mode-flow").click();
    expect(await page.locator(".flow-canvas").textContent()).toBe(diagram);
    await page.locator("#mode-cpp").click();
  }
});

test("F8: NUL e caratteri di controllo conservati e mostrati senza ambiguità", async ({
  page,
}) => {
  const result = await compare(
    page,
    '#include <iostream>\n#include <string>\nint main(){std::string s("a\\0b",3);std::string t="\\\\0\\n\\t";std::cout<<s.size()<<std::endl;return 0;}',
  );
  succeeded(result, "3\n");
  expect(result.flow.states.at(-1).values.s).toBe("a\\0b");
  expect(result.flow.states.at(-1).values.t).toBe("\\\\0\\n\\t");
});

test("F9: tooltip hoverable e chiudibile con Escape nelle quattro skin, mobile e desktop", async ({
  page,
}) => {
  await page.locator("#mode-flow").click();
  await page.locator(".flow-insert-handle").first().click();
  await page.getByRole("menuitem", { name: "FOR", exact: true }).click();
  const tooltip = page.locator(".flow-for-tooltip");
  for (const skin of ["laboratorio", "mappa", "segnali", "classica"]) {
    await page.locator(".settings-link").click();
    await page.locator(`#settings input[value="${skin}"]`).check();
    await page.locator(".settings-link").click();
    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      const part = page.locator(".flow-for-part").first();
      await part.scrollIntoViewIfNeeded();
      await part.focus();
      await expect(tooltip).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(tooltip).not.toBeVisible();
      await expect(part).toBeFocused();
      await page.locator("#run").focus();
      await part.hover();
      await expect(tooltip).toBeVisible();
      await tooltip.hover();
      // It must survive longer than the pointer-leave delay while hovered.
      await expect
        .poll(async () =>
          tooltip.evaluate(
            (e) => e.matches(":hover") && e.matches(":popover-open"),
          ),
        )
        .toBe(true);
      const heldAt = Date.now();
      await expect
        .poll(async () => {
          expect(await tooltip.isVisible()).toBe(true);
          return Date.now() - heldAt;
        })
        .toBeGreaterThan(300);
      await page.keyboard.press("Escape");
      await expect(tooltip).not.toBeVisible();
    }
  }
});

# Componenti di terze parti

- Binaryen 132.0.0 — contributori Binaryen — Apache 2.0, inclusa in
  toolchain/LICENSE.binaryen. Il passaggio Asyncify permette di sospendere e
  riprendere lo stack WebAssembly. La build separa il binario dal loader e
  impone un massimo di 512 MiB alla memoria; hash nel manifest.
  https://github.com/WebAssembly/binaryen

- browsercc 0.1.1 — Daniel Bertalan — MIT, inclusa in toolchain/LICENSE.browsercc.
  https://github.com/BertalanD/browsercc
- Clang/LLVM/LLD e relative componenti della toolchain — Apache 2.0 con LLVM
  Exceptions; copia in toolchain/LICENSE.llvm. I binari provengono dal pacchetto
  browsercc: la build locale applica un massimo alla memoria lineare. I sorgenti
  e le istruzioni di ricostruzione upstream sono nel repository browsercc.
- La versione del compilatore è Clang 20.1.2, commit
  `58df0ef89dd64126512e4ee27b4ac3fd8ddf6247`, con sysroot wasi-sdk 25. Le licenze
  LLVM, WASI, musl, cloudlibc ed Emscripten sono conservate nella cartella
  `licenses/` dei sorgenti e copiate in `toolchain/` nella release. Riferimento
  wasi-libc della release SDK: `574b88da481569b65a237cb80daf9a2d5aeaf82d`.
- @bjorn3/browser_wasi_shim 0.4.2 — Björn Svensson e contributori — licenza
  distribuita in toolchain/LICENSE.wasi; bundle locale esbuild.
  https://github.com/bjorn3/browser_wasi_shim
- Editor/core flowchart — riuso dei sorgenti del progetto informatica.

Modifiche al JavaScript browsercc: asset locali con verifica SHA-256, restituzione
del binario compilato e limite della diagnostica. Il manifest documenta gli hash
originali ed effettivi dei file di toolchain. Nessun codice di binji/wasm-clang
viene usato dalla release corrente.

Le dipendenze di sviluppo e verifica sono bloccate in package-lock.json. I relativi
strumenti Node e Playwright non vengono inclusi nel sito distribuito.

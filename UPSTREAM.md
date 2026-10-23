# Provenienza

- Progetto originale: https://github.com/profpako/informatica
- Percorso originale: `app/c++_visualizer`
- Ultimo aggiornamento upstream integrato: `442f8ffbdab19f447c57a751ad6d60035145b273`
- Messaggio upstream: `feat: import C++ flowcharts and add playback and PNG controls`
- Versione web iniziale di questa repository: **1.1.1**

La repository raccoglie il visualizzatore come progetto separato, conservando
i sorgenti e la documentazione originali. L'adattamento browser include Clang
WebAssembly, WASI, importazione AST, osservazioni automatiche dei flowchart,
quattro skin, uso offline, limiti di risorse e test di regressione.

Prima della pubblicazione sono stati verificati 96 test browser su Chromium,
Firefox e WebKit, 6 test unitari, il core Node e la sintassi Python. La pipeline
GitHub ripete i controlli prima del deploy. Il runtime nativo macOS rimane
distinto dalla verifica del sito web.

Le dipendenze e le relative licenze sono descritte in
`app/c++_visualizer/wasm-demo/THIRD_PARTY_NOTICES.md` e nella cartella `licenses/`.

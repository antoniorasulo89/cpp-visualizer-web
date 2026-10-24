# Dentro il codice — C++ Visualizer Web

Laboratorio didattico per costruire flowchart, compilare C++23 e osservare
l'esecuzione direttamente nel browser con Clang WebAssembly/WASI.

**[Apri l'applicazione](https://antoniorasulo89.github.io/cpp-visualizer-web/wasm-demo/?mode=flow)**

[Modalità C++](https://antoniorasulo89.github.io/cpp-visualizer-web/wasm-demo/?mode=cpp)
· [Istruzioni e limiti](app/c++_visualizer/wasm-demo/README.md)
· [Sicurezza](app/c++_visualizer/wasm-demo/SECURITY.md)

## Cosa include

- Compilazione ed esecuzione locale nel browser, senza server di compilazione.
- Importazione C++ → Flowchart tramite AST di Clang, subroutine, input/output,
  condizioni, cicli, array, stringhe, puntatori e riferimenti nel sottoinsieme supportato.
- Esecuzione per passi, riproduzione a velocità variabile e osservazioni delle variabili.
- Quattro skin selezionabili: Laboratorio, Mappa, Segnali e Classica.
- Bozze locali, import/export JSON, download C++/WebAssembly ed esportazione PNG.
- Uso offline dopo il primo caricamento completo della toolchain.

La prima compilazione scarica circa 29,7 MB compressi di toolchain. Le bozze
rimangono nel browser: esportare il lavoro importante. Il C++ e i flowchart hanno
tracciamento automatico nel sottoinsieme didattico. Per codice avanzato è
disponibile **Manuale (OSSERVA)**, con osservazioni numeriche esplicite.
La versione web non è un debugger C++ generale: il perimetro completo è nel README dedicato.

## Sviluppo e verifica

Servono Node.js 24 e npm:

```sh
cd app/c++_visualizer/wasm-demo
npm ci
npm run build
npx playwright install --with-deps chromium firefox webkit
npm run test:unit
npm test
npm run serve
```

Aprire `http://127.0.0.1:8768/wasm-demo/`. La cartella `release/` generata contiene
il sito statico completo. La suite della versione 1.2.0 comprende 117 esecuzioni
browser e 6 test unitari; copre anche le regressioni dei nove difetti dell'audit.

## Pubblicazione

Il workflow GitHub Actions verifica i sorgenti, costruisce il sito e pubblica su
GitHub Pages soltanto dopo il superamento dei controlli. I binari della toolchain
sono ottenuti da dipendenze bloccate durante la build e non vengono aggiunti a Git.
I pull request eseguono i controlli senza pubblicare.

## Origine e attribuzione

Questo progetto deriva dal visualizzatore di **[profpako/informatica](https://github.com/profpako/informatica/tree/442f8ffbdab19f447c57a751ad6d60035145b273/app/c%2B%2B_visualizer)**,
integrato fino al commit `442f8ff`, con adattamento WebAssembly, skin e correzioni
della versione web. I sorgenti e la documentazione dell'applicazione nativa
sono conservati in `app/c++_visualizer`; GitHub Pages serve la versione web.

[Provenienza](UPSTREAM.md) · [Note e licenze delle dipendenze](app/c++_visualizer/wasm-demo/THIRD_PARTY_NOTICES.md)

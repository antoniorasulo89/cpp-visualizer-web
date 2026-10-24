# Product
<!-- impeccable:product-schema 1 -->
## Platform
web
## Users
Docenti e studenti, per lezioni guidate e studio individuale. Confermato dall'utente il 23 ottobre 2026.
## Product Purpose
Costruire o scrivere un algoritmo, compilarlo nel browser e comprenderne i passi osservando diagramma, codice, valori e output.
## Operating Context
Laboratorio didattico in italiano. La stessa interfaccia deve sostenere spiegazione del docente e sperimentazione autonoma.
## Capabilities and Constraints
Applicazione statica HTML/CSS/JavaScript, compilatore C++ Clang/LLD WebAssembly in Worker interrompibile. Nessun sorgente inviato a server. Due modalità: C++23 con tracciamento automatico predefinito e selettore Manuale (OSSERVA), e flowchart con osservazioni automatiche. Il C++ automatico usa il sottoinsieme didattico validato tramite AST, conserva le righe originali e salva la scelta con la bozza. Conservare editor, input, esecuzione, traccia temporale, console, diagnostica, esportazioni, bozze locali e funzionamento offline dopo il caricamento. Integrazione upstream 442f8ff richiesta dall'utente: sintassi AlgoBuild, documenti versione 3 con migrazione 1/2, importazione C++ tramite AST Clang WASM, subroutine, stringhe, array, puntatori e riferimenti nel sottoinsieme didattico. Riproduzione con velocità locale e PNG. Non promettere un debugger C++ completo, UBSan, tutta la vista a frame nativa o conversione di costrutti non rappresentabili.
## Evidence on Hand
Implementazione e test in app/c++_visualizer/wasm-demo; prototipo pubblico locale su porta 8768.
## Product Principles
- Sospendere realmente le letture e rendere visibile il passaggio del dato alla variabile; offrire anche input preparato.
- Rendere leggibile il rapporto tra istruzione e cambiamento dei valori.
- Tenere i comandi di esecuzione raggiungibili durante il lavoro.
- Dare priorità ai compiti didattici rispetto alla descrizione del motore.
- Conservare chiarezza degli errori e controllo dell'esecuzione.

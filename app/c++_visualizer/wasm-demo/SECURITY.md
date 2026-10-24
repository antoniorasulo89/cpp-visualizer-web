# Modello di esecuzione

Il sorgente è compilato nel browser in un Worker monouso. Il programma generato
è WebAssembly/WASI: riceve solo stdin, stdout/stderr e gli hook di osservazione/input.
Non riceve directory preaperte, accesso al filesystem del dispositivo, socket,
DOM, storage del browser o credenziali. Output, nomi, diagnostica e sorgenti sono
inseriti nell'interfaccia come testo.

Limiti per esecuzione: 64 MiB di memoria lineare del programma, stack 1 MiB,
512 MiB per ciascun modulo del compilatore/linker/trasformatore, 800 osservazioni, 8 MiB di
traccia stimata, 20.000 byte di output, 10.000 byte di input UTF-8, 30.000 byte
di sorgente manuale. Il generato dei flowchart ha limite 128 KiB prima della strumentazione e 256 KiB dopo;
il sorgente originale resta limitato dal core. I limiti di memoria dei moduli
sono imposti nel binario, non soltanto controllati dopo un'allocazione.

Il browser mantiene anche heap JavaScript, filesystem virtuali e copie dei dati:
i limiti della memoria lineare non sono un tetto alla RAM totale del processo.
Timeout di caricamento/compilazione 90 secondi e di esecuzione 5 secondi; Interrompi
termina il Worker. I timer dipendono dalla pianificazione del browser, in
particolare con schede in background. Il Worker viene ritirato a ogni prova.
La modalità interattiva applica Asyncify al programma e riserva 256 KiB alla
copia dello stack sospeso, entro la memoria del programma. Il budget di 5 secondi
si riavvia a ogni ripresa; mentre l'utente sceglie un passo o un input il timer
è fermo. Restano attivi i limiti complessivi di traccia, memoria e output.
Ogni risposta è limitata a 4095 byte e l'input cumulativo a 10.000 byte UTF-8.
Risposte con ID obsoleto e valori incompatibili con il tipo richiesto non
fanno riprendere il programma. Le risposte interattive compaiono nella traccia
in memoria e non vengono salvate nella bozza; l'input preparato conserva il salvataggio locale.

Il confine JavaScript/WASM limita a 200 i nomi osservati e controlla i byte dei
valori pendenti, anche se il programma chiama direttamente gli hook. Lo stato
finale aggiuntivo usa lo stesso budget della traccia. L'hook testuale è riservato
al tracciamento automatico del C++ e ai flowchart; riceve una lunghezza esplicita, verificata insieme al
puntatore prima della decodifica. I caratteri di controllo sono rappresentati
con escape leggibili. I controlli non dipendono soltanto dalle classi C++ generate.

I binari derivano dai pacchetti npm browsercc 0.1.1 e Binaryen 132.0.0, con limite di memoria
applicato durante la build. Il lockfile blocca le dipendenze e le relative
integrità npm. Il manifest conserva hash upstream e hash degli asset effettivi;
il loader verifica dimensione e SHA-256 degli asset binari prima di usarli.
Questo rileva corruzione e mescolanza di versioni, non sostituisce HTTPS e la
sicurezza dell'account che pubblica la release. Non è una garanzia sull'assenza
di difetti del compilatore o del browser.

Il server di verifica serve soltanto la cartella release su loopback e applica
CSP e nosniff. Il sito contiene anche una CSP in meta per hosting statici che
non consentono intestazioni personalizzate, incluso Pages. Per l'hosting pubblico
usare HTTPS; non aggiungere unsafe-inline o endpoint di compilazione remoti.

Bozze e input sono salvati solo nel localStorage dell'origine, senza telemetria.
Su dispositivi condivisi gli utenti della stessa origine/profilo possono leggerli:
non usarli per dati personali o segreti. Esportare ciò che serve conservare.

La modalità C++ automatica valida il sottoinsieme didattico prima di inserire
osservazioni tramite AST. Quella manuale supporta osservazioni esplicite, non un debugger C++
completo. Entrambe usano C++23. Le eccezioni C++ sono disabilitate nella toolchain utilizzata. I controlli
del runtime WebAssembly non equivalgono ai controlli sui limiti degli array C++
o a UBSan: un accesso errato dentro la memoria lineare può non generare trap.

La conversione C++ in flowchart usa esclusivamente l'AST di Clang WASM nel Worker e non avvia il programma. Il JSON dell'albero ha un limite di 12 MiB, le chiamate annidate osservate sono limitate a 128 e i valori testuali a 4096 byte. L'esportazione PNG usa immagini SVG blob locali: soltanto img-src ammette blob:, mentre script e worker rimangono limitati alla stessa origine.

# Dentro il codice — versione web 1.3.1

Compilazione C++23, esecuzione WebAssembly/WASI e visualizzazione delle variabili
direttamente nel browser. Nessun sorgente o input viene inviato a servizi di
compilazione. Il sito pubblicato richiede soltanto file statici su HTTPS.

La versione 1.3.1 mostra nella console l'eco dell'input con l'a capo di Invio.
Se Riproduci era attivo, riprende automaticamente dopo il trasferimento del
valore, ora più visibile. Pausa e Interrompi annullano la ripresa prevista.

La versione 1.3.0 ha aggiunto l'input interattivo in C++ e nei flowchart: il motore
si sospende davvero e chiede un valore al momento della lettura. Dopo la conferma
il valore raggiunge la cella della variabile con un'animazione breve, oppure con
un'evidenziazione se il dispositivo richiede movimento ridotto. Lo stack viene
conservato con Asyncify, senza rieseguire le istruzioni precedenti e senza
richiedere intestazioni speciali a GitHub Pages. Resta disponibile l'input preparato.

La versione 1.2.0 ha introdotto il tracciamento automatico del C++ scritto nell’editor:
ogni istruzione registra valori e output, mantenendo le righe del sorgente.
Non servono macro OSSERVA per i programmi del sottoinsieme didattico.
Analisi AST e compilazione usano entrambe C++23. Le quattro skin sono conservate.

La revisione 1.1.1 aveva corretto i nove difetti dell'audit d'integrazione: stato degli
alias, prefissi ++/--, ambiti e dichiarazioni dei FOR tramite AST, EOF
condizionale, limiti JS della traccia, importazione di tipi non rappresentabili,
stringhe con NUL e interazione dei tooltip. Conserva le quattro skin e il formato JSON 3.

## Compilare e avviare la release

Servono Node.js 24 e npm soltanto per preparare e verificare il pacchetto.
Dalla cartella `app/c++_visualizer/wasm-demo`:

```sh
npm ci
npm run build
npm run serve
```

Aprire <http://127.0.0.1:8768/wasm-demo/>. Su Windows usare `npm.cmd` se la
configurazione di PowerShell blocca gli script npm.ps1. Non usare `file://`.
Il server serve la cartella `release/` su loopback; non compila il C++.

## Skin e impostazioni

Aprire **Impostazioni** nella testata e scegliere **Laboratorio**, **Mappa**,
**Segnali** o **Classica**. La modifica è immediata e conserva programma,
input, diagramma e traccia di esecuzione. La preferenza è salvata nel browser
per questo percorso del sito. Se il salvataggio locale non è disponibile,
la skin resta utilizzabile per la visita corrente e compare un avviso.
Le skin condividono gli stessi comandi e limiti del motore. Su schermi piccoli
i pannelli si dispongono in colonna e il diagramma si può scorrere al suo interno.

La build genera `toolchain/`, `sw.js` e `release/`, esclusi da Git perché
riproducibili dal lockfile e dagli script. Dopo un checkout serve la build.

## Pubblicazione statica

Pubblicare **l'intero contenuto di `release/`**, mantenendo la struttura:

```text
index.html
.nojekyll
flowchart-core.js
flowchart-editor.js
flowchart.css
wasm-demo/
  index.html, demo.js, demo.css, skins.js, skins.css, worker.js, assets.js, flow-wasm.js
  runtime.hpp, sw.js, documentazione e toolchain/
```

Il file di ingresso rinvia a `wasm-demo/`. Tutti i percorsi applicativi sono
relativi: la release può vivere nella radice o sotto un percorso di progetto.
GitHub Pages può servire questa struttura senza Python o backend. Il workflow
`pages.yml` esegue build e test su tre runner separati e pubblica automaticamente
su GitHub Pages dopo il superamento dei controlli. Chromium usa il browser completo
in modalità headless per verificare anche le trap WebAssembly su Linux.

Servire `.js` come JavaScript, `.wasm` come `application/wasm`, `.gz` come
`application/gzip`. I file `.gz` sono letti e decompressi dall'applicazione:
non applicare loro un'ulteriore `Content-Encoding: gzip`. Il server di verifica
include CSP/nosniff; una CSP in meta è presente anche nel documento HTML.

## Uso

- **Codice C++:** il selettore **Tracciamento C++** parte da **Automatico**.
  Scrivere il programma, compilare e usare Avanti/Indietro: istruzioni, variabili
  e output sono registrati tramite AST senza modificare il testo nell’editor.
  Le variabili non inizializzate mostrano `?`; una lettura prima dell’inizializzazione
  interrompe l’esecuzione conservando la traccia già ricevuta.
  **Manuale (OSSERVA)** permette di compilare codice fuori dal sottoinsieme
  automatico e registrare valori numerici con `OSSERVA(variabile)`.
- **Flowchart:** costruire o aprire un diagramma, quindi premere **Compila e
  visualizza**. Le osservazioni vengono inserite automaticamente. L'esempio
  somma 1…5 e produce 15, con 22 osservazioni e fotografia finale.
- Con **Chiedi durante l'esecuzione**, **Avanti** esegue la prossima istruzione.
  La lettura apre un riquadro centrale con nome, tipo e richiesta del programma.
  Confermare con Invio o **Conferma valore**; usare **Fine input** per segnalare EOF.
  **Interrompi** o Esc terminano l'esecuzione conservando i passi già prodotti.
  Le attese dell'utente non consumano il timeout di esecuzione. Numeri reali:
  usare il punto decimale; ogni risposta è una riga terminata da un a capo.
  **Riproduci** procede alla velocità scelta e attende quando serve un input;
  dopo la risposta e il trasferimento del valore riprende automaticamente.
  Se si procedeva con **Avanti**, l'esecuzione rimane invece per passi.
- **Avanti/Indietro** e cursore navigano anche fotografie già registrate. Il blocco attivo,
  gli esiti Vero/Falso e la console seguono il passo. Le condizioni vengono
  valutate una sola volta, anche quando contengono un incremento.
- Selezionare **Input preparato** per inserire tutti i dati prima dell'avvio e
  registrare l'intera esecuzione senza pause. L'input e l'output sono
  UTF-8. In modalità interattiva la console mostra il dato digitato e l'a capo
  di Invio, separatamente dall'output reale del programma; nell'input preparato
  mostra soltanto l'output del programma.
  Ad esempio, per leggere un intero e un reale inserire `5 2.5` nel campo Input:
  i numeri possono essere separati da spazi o a capo; usare il punto decimale.
- **Interrompi** termina il Worker. Le fotografie e l'output già ricevuti vengono
  conservati come traccia parziale, anche dopo un errore runtime o un timeout.
- Errori del flowchart: righe tradotte nel C++ leggibile e selezione del blocco
  responsabile. Ogni nuovo tentativo azzera la diagnostica precedente.
- Bozze di codice, diagramma, input e modalità sono salvate su questo dispositivo.
  Se lo storage non è disponibile compare un avviso. JSON e `.cpp` possono essere
  scaricati; nel sorgente manuale esportato la macro OSSERVA richiede una definizione
  se si vuole compilare fuori da questa applicazione.
- Il download `.wasm` contiene un comando WASI preview1 con eventuali importazioni
  `env.cv_trace`, `env.cv_text`, `env.cv_flow_reset`, `env.cv_flow_commit`,
  `env.cv_input`: un runtime esterno deve implementarle e, per un binario
  interattivo, gestire Asyncify. Non è un eseguibile Windows/macOS.

Il nome, il tipo e il trasferimento verso la cella sono disponibili per le
letture strumentate del C++ automatico e dei flowchart. In modalità manuale
le letture standard sospendono il motore con un riquadro generico; le variabili
visibili dipendono dalle macro OSSERVA. Un dato già presente nel buffer di
`cin` non richiede un altro riquadro: `getline` dopo un numero conserva quindi
il normale comportamento C++ sull'a capo rimasto nel flusso.

## Perimetro supportato

L'aggiornamento integra il codice di profpako/informatica al commit
442f8ffbdab19f447c57a751ad6d60035145b273 del 23 ottobre 2026. Il motore nativo
rimane nella cartella superiore; questa distribuzione adatta le novità a un sito
statico, con Clang WebAssembly e senza API Python.

Flowchart: INPUT e assegnamenti multilinea, variabili implicite con tipo stabile,
OUT/OUTLN, condizioni, IF/WHILE/FOR/DO...WHILE, salti, subroutine e parametri,
stringhe, array fino a 100 elementi, puntatori e riferimenti di base. Le variabili
create nei rami/cicli dei diagrammi AlgoBuild durano per la subroutine; quelle
non ancora create restano nascoste. Una lettura prima dell'inizializzazione
interrompe la traccia con un messaggio. Le celle non inizializzate appaiono come ?.
Il compilatore determina i tipi e le espressioni non sono rivalutate per osservarle.
I riferimenti condividono lo stato di inizializzazione dell'oggetto osservato.
I FOR possono dichiarare contatori scalari o stringhe; il loro ambito termina
con il ciclo anche quando contiene DO o altri cicli. Un EOF controllato tramite
`while (cin >> x)` o `while (getline(cin, s))` termina normalmente; un blocco INPUT
senza dati validi segnala invece l'errore. Nelle celle osservate NUL e caratteri
di controllo sono mostrati con escape (`\0`, `\n`, `\t`); un backslash letterale
è distinto con `\\`. Il testo trasmesso dal runtime è limitato a 4096 byte.
I nomi delle variabili di funzioni richiamate comprendono funzione e identificativo
della chiamata; non viene riprodotta tutta la vista a frame del motore nativo.

**C++ → Flowchart** analizza il sorgente con l'AST di Clang WebAssembly e non lo
esegue. Include funzioni, console, dichiarazioni, condizioni, cicli e salti.
I diagrammi importati conservano gli ambiti C++ e i contatori locali al FOR.
Il sorgente originale rimane nell'editor C++; Annulla ripristina il diagramma
precedente. Globali/statiche, switch, overload, parametri predefiniti e costrutti
non rappresentabili vengono rifiutati interamente con una diagnosi. Sono ammessi
gli header iostream/string/iomanip/type_traits.
I puntatori sono limitati a un livello: puntatori multipli e combinazioni con
riferimenti o array di puntatori sono rifiutati prima di sostituire il diagramma.
OSSERVA del precedente esempio
web è riconosciuto e omesso dal diagramma: non è un'istruzione dell'algoritmo.
Il formato salvato è versione 3; i documenti 1 e 2 vengono migrati dal core comune.

Le frecce (+) e la palette aprono lo stesso menu di inserimento; FOR usa
l'esagono e tooltip separati. Riproduci/Pausa scorre la traccia registrata senza
rieseguire il programma; la velocità si può cambiare durante la riproduzione ed
è ricordata localmente. Esporta PNG scarica l'intero diagramma della subroutine
selezionata con la skin attuale, senza comandi di inserimento.

Il codice viene compilato da Clang 20.1.2 (browsercc 0.1.1), con `-std=c++23`,
-O0 ed eccezioni C++ disabilitate. Questo aggiorna il dialetto del linguaggio;
il compilatore e la libreria WASI restano quelli della toolchain verificata e non
implementano necessariamente ogni funzionalità di C++23. C++26 non è il default.
Le osservazioni numeriche sono trasmesse come double: interi oltre 2^53 possono
perdere precisione. L’automatico usa il sottoinsieme importabile in flowchart
anche per il C++ scritto a mano e conserva il sorgente originale. Le dichiarazioni
multiple senza dipendenze sono ammesse (`int x, s;`); separare invece dichiarazioni
che si riferiscono l’una all’altra (`int x; int y=x;`). Costrutti non supportati
segnalano come passare a Manuale, senza cambiare automaticamente il comportamento.
Nei flowchart un adattatore esplicito conserva gli output UTF-8 `u8"..."` dei
documenti C++17; il C++ scritto a mano segue le regole C++23 per `char8_t`.
Non è un debugger generale. Non sono inclusi ruoli,
indirizzi/pila del visualizzatore nativo o UBSan. Un accesso scorretto a un array
C++ non è necessariamente rilevato se resta nella memoria lineare WebAssembly.

## Risorse e limiti

- Primo uso interattivo: circa **32,0 MB decimali / 30,5 MiB compressi** per binari e sysroot,
  più interfaccia e runtime. Se DecompressionStream non è disponibile si usano
  gli asset non compressi, circa 104,3 MB. L'input preparato non carica il binario
  Binaryen (circa 2,3 MB compressi). Nessun CDN richiesto a runtime.
- Uso offline dopo un primo caricamento completo con service worker attivo;
  il browser può comunque cancellare la cache per liberare spazio. Lo storage
  non è un backup: esportare il lavoro importante.
- Aggiornamenti: una nuova versione segnala **Aggiorna applicazione**. La prima
  installazione del service worker non ricarica la pagina mentre si lavora.
- Memoria lineare del programma: massimo **64 MiB**, stack lineare 1 MiB.
  Compilatore, linker e Binaryen: massimo **512 MiB per modulo**. Il processo browser ha
  anche heap JavaScript e copie dei dati: questi non sono limiti alla RAM totale.
- 800 osservazioni, traccia stimata massima 8 MiB, output 20.000 byte, input
  10.000 byte UTF-8, sorgente manuale 30.000 byte, generato prima della strumentazione 128 KiB, strumentato 256 KiB.
- Timeout 90 secondi per caricamento/compilazione e 5 secondi per esecuzione.
  Nel modo interattivo i 5 secondi valgono per ogni tratto tra due pause;
  l'attesa di un comando o di un valore non consuma il budget.
  I timer possono essere ritardati dal browser nelle schede in background.
- Lo stato finale aggiuntivo rientra nello stesso budget di 8 MiB. Valori
  pendenti e massimo 200 nomi osservati sono controllati anche al confine JS/WASM;
  l'hook testuale interno è disponibile nel tracciamento automatico e nei flowchart;
  è respinto nella modalità Manuale (OSSERVA).

## Verifica e manutenzione

```sh
npm run test:unit
node ../test_flowchart.cjs
npx playwright install chromium firefox webkit
npm test
```

I test coprono i nove difetti dell'audit, calcoli/rami/ambiti, limiti fisici della
memoria, input/output UTF-8, errori, interruzione, salvataggio, esportazioni,
integrità degli asset, offline, tastiera, axe e layout desktop/mobile. Playwright
usa un motore WebKit di test: questo non equivale a una prova su iPhone fisico.
Il motore nativo macOS è separato e non viene verificato da questa suite web.
`tests/audit.spec.mjs` confronta C++ originale e strumentato e controlla gli stati
intermedi; include i nove difetti d'integrazione, i tooltip nelle quattro skin e
tentativi di aggirare i limiti senza usare gli osservatori C++ generati.

Per aggiornare una dipendenza cambiare esplicitamente la versione, rigenerare il
lockfile, eseguire build e suite completa, conservare manifest e risultati e
pubblicare la nuova cartella release. Non mescolare file di due build.

Vedere [SECURITY.md](SECURITY.md) e [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
La toolchain proviene da un pacchetto npm bloccato con integrità: la build
dell'app è riproducibile da quell'artefatto; la ricostruzione completa di LLVM
dai suoi sorgenti è un'attività distinta.

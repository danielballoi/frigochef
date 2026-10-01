# Decisioni (ADR brevi)

Formato: contesto → decisione → conseguenze.

## ADR-001 — Archivio ricette in file JSON, non in un database

**Contesto.** Servono circa 150–200 ricette e un vocabolario di ingredienti, letti molto e mai modificati
dall'app. Il progetto deve restare semplice da mettere in container.

**Decisione.** Ricette e vocabolario sono due file JSON in `backend/data/`, caricati in memoria all'avvio.
L'unico modulo che li legge è `src/recipes/recipeRepository.js`.

**Conseguenze.** Nessun servizio in più da gestire; la ricerca su ~200 ricette in memoria richiede pochi
millisecondi. `/api/ready` diventa 200 solo dopo il caricamento. Per passare a PostgreSQL basta una nuova
implementazione del repository con la stessa interfaccia (`load`, `isLoaded`, `getRecipes`,
`normalizeIngredients`, `searchIngredients`).

## ADR-002 — Vocabolario chiuso di ingredienti con sinonimi

**Contesto.** I nomi del modello di visione ("pomodorini", "uovo") devono coincidere con quelli delle ricette.

**Decisione.** Un vocabolario unico (`ingredients.json`) con nome normalizzato, categoria e sinonimi. Al modello
si passa l'elenco dei nomi; la risposta viene normalizzata (minuscolo, senza accenti, sinonimi → nome) e ciò
che non è nel vocabolario viene scartato. Anche l'autocompletamento e la ricerca ricette usano lo stesso indice.

**Conseguenze.** Niente ingredienti "inventati"; un ingrediente nuovo va aggiunto al vocabolario.
`npm run validate:data` (e un test) verifica che ogni ingrediente delle ricette esista e che nessun sinonimo
sia ripetuto.

## ADR-003 — Ricette dall'archivio, non generate dall'AI

**Contesto.** Il modello gira su CPU con poca RAM; ricette generate sarebbero lente e non affidabili.

**Decisione.** Il modello serve solo a riconoscere gli ingredienti. Le ricette vengono cercate nell'archivio.

**Conseguenze.** Ricerca istantanea e risultati prevedibili; l'AI non consuma risorse per questa parte.

## ADR-004 — Punteggio delle ricette e filtro di pertinenza

**Contesto.** RF-05: prima le ricette senza mancanti, poi 1, poi 2; massimo 10.

**Decisione.** Disponibili = frigo + dispensa. Ordine: meno mancanti → più ingredienti del frigo usati →
meno ingredienti in totale → nome. In più due filtri: la ricetta deve usare **almeno un ingrediente del frigo**
(altrimenti si proporrebbero solo piatti di dispensa) e, se le manca qualcosa, deve usare dal frigo **più
ingredienti di quanti ne manchino** (con solo "limone" non si propone "fragole con panna").

**Conseguenze.** Risultati più utili con frighi poco forniti; le regole sono in `findRecipes.js` con i test.

## ADR-005 — Una richiesta per foto, unione delle liste nel frontend

**Contesto.** Su CPU ogni foto può richiedere fino a 60–90 s; il numero di ripiani è variabile.

**Decisione.** Il frontend invia le foto **una alla volta** a `POST /api/recognize` e unisce le liste senza
doppioni. Se una foto fallisce, le altre restano valide e quella si può riprovare.

**Conseguenze.** Ogni chiamata resta entro il timeout; l'utente vede l'avanzamento ("Ripiano 2 di 5…").
Il backend resta senza stato.

## ADR-006 — Ridimensionamento e conversione in JPEG nel telefono

**Contesto.** Le foto del telefono pesano 3–10 MB; l'iPhone usa HEIC, che il modello e il backend non gestiscono.

**Decisione.** Il frontend decodifica la foto, la riduce a 1280 px sul lato lungo e la riconverte in JPEG con
un canvas prima dell'invio. Il backend accetta solo JPEG/PNG/WebP e controlla i primi byte del file.

**Conseguenze.** Upload leggeri e veloci anche in mobilità; HEIC funziona dove il browser lo sa decodificare
(Safari su iPhone).

## ADR-007 — Provider di visione intercambiabile (`mock` / `ollama`)

**Contesto.** Sviluppo e test devono funzionare senza Ollama.

**Decisione.** Interfaccia unica `recognize(buffer)` / `check()` con due implementazioni scelte da
`VISION_PROVIDER`. Il provider Ollama riceve `fetch` come dipendenza, così i test lo simulano senza rete.

**Conseguenze.** `npm test` passa ovunque; in produzione basta cambiare una variabile.

## ADR-008 — Configurazione solo da variabili d'ambiente, validata all'avvio

**Decisione.** Nessun file di configurazione letto a runtime; valori predefiniti sensati; validazione con zod
e uscita con codice 1 se un valore è sbagliato.

**Conseguenze.** Adatto a ConfigMap e container; gli errori di configurazione emergono subito invece che alla
prima richiesta.

## ADR-009 — Niente librerie UI e niente risorse esterne nel frontend

**Decisione.** React con CSS semplice, font di sistema, icone generate da uno script Node senza dipendenze
(`npm run icons`). Nessun CDN, font remoto o tracciamento.

**Conseguenze.** Pacchetto piccolo (circa 75 KB gzip di JS), funziona offline (tranne le chiamate `/api`),
nessun problema di privacy.

## ADR-010 — Dispensa salvata nel telefono

**Decisione.** La dispensa è in `localStorage` (con `try/catch`: in navigazione privata può non essere
disponibile); i valori iniziali arrivano da `/api/config` (`PANTRY_DEFAULT`).

**Conseguenze.** Nessun account né dato personale sul server.

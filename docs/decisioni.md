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

**Decisione.** Un vocabolario unico (`ingredients.json`) con nome normalizzato, categoria e sinonimi. Il modello
elenca liberamente gli alimenti (prompt corto, **senza** l'elenco dei nomi: vedi ADR-011); la risposta viene
normalizzata (minuscolo, senza accenti, sinonimi → nome) e ciò che non è nel vocabolario viene scartato.
Anche l'autocompletamento e la ricerca ricette usano lo stesso indice.

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

**Decisione.** Il frontend decodifica la foto, la riduce a **768 px** sul lato lungo (prima 1280: vedi ADR-011)
e la riconverte in JPEG con un canvas prima dell'invio. Il backend accetta solo JPEG/PNG/WebP e controlla i primi byte del file.

**Conseguenze.** Upload leggeri e veloci anche in mobilità; HEIC funziona dove il browser lo sa decodificare
(Safari su iPhone).

## ADR-007 — Provider di visione intercambiabile (`mock` / `gemini` / `ollama`)

**Contesto.** Sviluppo e test devono funzionare senza modello vero.

**Decisione.** Interfaccia unica `recognize(buffer)` / `check()` con tre implementazioni scelte da
`VISION_PROVIDER`. I provider Gemini e Ollama ricevono `fetch` come dipendenza, così i test li simulano senza rete.

**Conseguenze.** `npm test` passa ovunque; in produzione basta cambiare una variabile.

## ADR-008 — Configurazione solo da variabili d'ambiente, validata all'avvio

**Decisione.** Nessun file di configurazione letto a runtime; valori predefiniti sensati; validazione con zod
e uscita con codice 1 se un valore è sbagliato.

**Conseguenze.** Adatto a ConfigMap e container; gli errori di configurazione emergono subito invece che alla
prima richiesta. Unica comodità per lo sviluppo: `npm run dev` e `npm start` passano a Node
`--env-file-if-exists=.env`, così la chiave Gemini sta in `backend/.env` (ignorato da git) e non nella shell.
Senza il file (es. nel container) non cambia nulla.

## ADR-009 — Niente librerie UI e niente risorse esterne nel frontend

**Decisione.** React con CSS semplice, font di sistema, icone generate da uno script Node senza dipendenze
(`npm run icons`). Nessun CDN, font remoto o tracciamento.

**Conseguenze.** Pacchetto piccolo (circa 75 KB gzip di JS), funziona offline (tranne le chiamate `/api`),
nessun problema di privacy.

## ADR-010 — Dispensa salvata nel telefono

**Decisione.** La dispensa è in `localStorage` (con `try/catch`: in navigazione privata può non essere
disponibile); i valori iniziali arrivano da `/api/config` (`PANTRY_DEFAULT`).

**Conseguenze.** Nessun account né dato personale sul server.

## ADR-011 — Riconoscimento con Google Gemini (cloud) invece di un modello locale

**Contesto.** Il piano prevedeva un modello di visione open source in locale con Ollama. Prova del 2 ottobre
2026 su 2 foto vere del frigo, sul PC di sviluppo: Intel i5-8365U (4 core / 8 thread, portatile a basso
consumo), nessuna GPU, 7,7 GB di RAM in WSL; timeout dell'app 90 s. Dettagli in `docs/valutazione-modello.md`.

| Modello (Ollama, CPU) | Tempo per foto | Esito |
|---|---|---|
| `qwen3-vl:2b` (variante "thinking"), vocabolario nel prompt | > 300 s | nessuna risposta: ragiona per centinaia di token, anche con `think: false` |
| `qwen3-vl:2b-instruct`, vocabolario nel prompt | 158–177 s | ricopia il vocabolario (50+ voci) |
| `qwen2.5vl:3b`, vocabolario nel prompt | > 300 s | nessuna risposta |
| `qwen2.5vl:3b`, prompt corto, foto a 768 px | 138–213 s | 1 ingrediente giusto su 6 (17%), una risposta in ciclo ("miele, miele…") |

Il collo di bottiglia è la lettura del prompt su CPU: ~6–19 token/s. Il vocabolario nel prompt valeva ~1500
token; tolto quello, la sola immagine (~1100 token) richiede ancora 1,5–3 minuti. I modelli da 4b sarebbero
più lenti. Su questo hardware nessun modello locale sta nel timeout.

**Decisione.** Nuovo provider `VISION_PROVIDER=gemini` (API REST di Google Gemini, piano gratuito), modello
`gemini-3.5-flash-lite` (configurabile con `GEMINI_MODEL`), ragionamento al minimo, risposta JSON con schema.
Il prompt resta corto e senza vocabolario; il confronto con il vocabolario lo fa il backend (ADR-002).
Le foto vengono ridotte a 768 px: Gemini conta l'immagine a token fissi (1136 token di prompt sia a 768 sia
a 1280 px) e a 768 px ha riconosciuto gli stessi ingredienti, con un upload circa tre volte più leggero.
`mock` resta il predefinito (test e sviluppo); `ollama` resta per macchine con GPU.

| Modello (Gemini, foto a 768 px) | Tempo per foto | Giusti | Inventati | Mancanti |
|---|---|---|---|---|
| **`gemini-3.5-flash-lite`** | **1,1 s** | **6 / 6** | 1 ("latte": cartoni di succo) | 0 |
| `gemini-3.1-flash-lite` | 4,4–10,9 s | 6 / 6 | 1 ("passata di pomodoro") | 0 |
| `gemini-3.8-flash` | — | — | — | non disponibile durante la prova (503, troppa richiesta) |
| `gemini-2.5-flash`, `gemini-2.5-flash-lite` | — | — | — | non più disponibili per le chiavi nuove (404) |

**Conseguenze.**
- Riconoscimento in 1–2 s invece di minuti; nessun container Ollama né volume per i modelli nel cluster.
- Serve una chiave (`GEMINI_API_KEY`): è l'unico segreto dell'app → Secret Kubernetes, mai in git né nei log.
  Il backend la manda solo nell'header `x-goog-api-key`; senza chiave con `VISION_PROVIDER=gemini` non parte.
- Serve l'accesso a Internet in uscita verso `generativelanguage.googleapis.com:443`.
- Privacy: **le foto escono dal cluster e vengono inviate a Google**. FrigoChef non le salva, ma per il piano
  gratuito valgono i termini di Google (con i servizi non a pagamento Google può usare i contenuti inviati per
  migliorare i propri prodotti: da verificare nei termini aggiornati). L'informativa nell'app lo dice (RF-08).
- Il piano gratuito ha limiti di richieste al minuto e al giorno: oltre il limite il backend risponde 429
  `VISION_QUOTA` con un messaggio chiaro ("Riprova tra N secondi").
- Il progetto non è più "tutto open source in locale" per la parte AI; tornare a Ollama è una variabile.

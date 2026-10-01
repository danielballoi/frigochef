# Prompt per Claude Code — FrigoChef (solo codice dell'app)

Leggi prima `docs/analisi-funzionale.md`: è la fonte dei requisiti (RF-01 … RF-08). Questo file dice **cosa devi fare tu e cosa NON devi fare**.

## Contesto

FrigoChef è un progetto di portfolio DevOps. Tu scrivi **solo il codice dell'app** (frontend, backend, archivio ricette, test). Tutta la parte DevOps la scrive **Daniel a mano**, per imparare: se la fai tu, il progetto perde il suo scopo.

## Regole che non si possono violare

1. **NON creare né modificare**: `Dockerfile`, `.dockerignore`, `docker-compose*.yml`, `.github/` (workflow), `deploy/`, `argocd/`, manifest Kubernetes, Helm, Kustomize, script di deploy, file `nginx.conf`. Se pensi che servano, scrivilo in `docs/per-il-devops.md` come **informazione** (porte, variabili, comandi), **senza** scrivere il file al posto di Daniel.
2. **Nessun servizio esterno**: nessuna API di AI o di ricette, nessuna chiave, nessun tracciamento, nessun font o script da CDN. Tutto deve funzionare offline tranne la chiamata a Ollama.
3. **Nessun segreto** nel codice o nei file di esempio.
4. **Git**: lavora nel repository locale `~/frigochef`, commit piccoli con messaggi in stile Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`). **Non fare push**, non creare repository su GitHub, non cambiare la configurazione di git.
5. Niente `sudo`. Non installare Ollama o altri programmi di sistema: se serve, fermati e dillo.
6. Prima di iniziare mostrami il **piano**; poi procedi per fasi e alla fine di ogni fase fermati con un breve riepilogo e i comandi per provarla.

## Stack

- Node.js **22**, npm. Due progetti separati, ognuno con il proprio `package.json` e `package-lock.json`: `frontend/` e `backend/` (niente workspaces: devono poter essere costruiti in container separati).
- **Backend**: Express, ES modules, `helmet`, `express-rate-limit`, `multer` (in memoria, mai su disco), validazione input con `zod`, log JSON con `pino`. Test con **Vitest + Supertest**.
- **Frontend**: React + Vite, `vite-plugin-pwa`, CSS semplice (niente librerie UI pesanti). Test con **Vitest + Testing Library**.
- ESLint in entrambi. Script npm standard: `dev`, `start` (backend), `build` (frontend), `test`, `lint`.

## Backend — cosa deve fare

**Configurazione solo da variabili d'ambiente**, con valori predefiniti e validazione all'avvio (se un valore è sbagliato: errore chiaro e uscita). Documentale tutte in `backend/.env.example` e in `docs/per-il-devops.md`:

| Variabile | Predefinito | Significato |
|---|---|---|
| `PORT` | `3000` | porta HTTP |
| `VISION_PROVIDER` | `mock` | `mock` oppure `ollama` |
| `OLLAMA_URL` | `http://localhost:11434` | indirizzo di Ollama |
| `VISION_MODEL` | `qwen3-vl:4b` | nome del modello |
| `VISION_TIMEOUT_MS` | `90000` | tempo massimo di riconoscimento |
| `MAX_IMAGE_MB` | `5` | dimensione massima di ogni foto |
| `MAX_PHOTOS` | `8` | numero massimo di foto (ripiani) per analisi, esposto al frontend da `/api/config` |
| `PANTRY_DEFAULT` | `sale,pepe,olio d'oliva,zucchero,pasta,riso,farina,aceto,acqua` | dispensa predefinita |
| `RATE_LIMIT_PER_MIN` | `20` | richieste di analisi al minuto per IP |
| `LOG_LEVEL` | `info` | livello dei log |

**Endpoint** (tutti sotto `/api`):

| Metodo e percorso | Cosa fa |
|---|---|
| `GET /api/health` | 200 se il processo è vivo (non controlla nulla di esterno) |
| `GET /api/ready` | 200 quando l'archivio ricette è caricato, altrimenti 503 |
| `GET /api/health/model` | 200 se il provider di visione risponde (con `mock` sempre 200), altrimenti 503 |
| `GET /api/config` | dispensa predefinita e limiti utili al frontend |
| `GET /api/ingredients?q=zuc` | suggerimenti dal vocabolario (per l'autocompletamento) |
| `POST /api/recognize` | `multipart/form-data` con campo `image` (JPEG/PNG/WebP) → `{ ingredients: [...], model, durationMs }` |
| `POST /api/recipes` | `{ ingredients: [...], pantry: [...] }` → ricette ordinate come da RF-05 |

**Riconoscimento (RF-02)**
- Un'interfaccia unica `recognize(imageBuffer)` con due implementazioni: `mock` (restituisce ingredienti plausibili, con un piccolo ritardo) e `ollama` (chiama l'API HTTP di Ollama `/api/chat` con l'immagine in base64).
- Nel prompt al modello passa il **vocabolario degli ingredienti** e chiedi una risposta **JSON** (usa il parametro `format` di Ollama). Normalizza la risposta con i sinonimi, scarta ciò che non è nel vocabolario, togli i duplicati.
- Timeout con `AbortController`; errori tradotti in messaggi chiari (504 timeout, 502 modello non raggiungibile, 413 immagine troppo grande, 415 formato non valido).
- L'immagine resta solo in memoria e non viene mai scritta nei log.

**Ricerca ricette (RF-05)**
- Un modulo `recipeRepository` è **l'unico** punto che legge l'archivio (così in futuro si potrà passare a un database senza toccare il resto).
- Punteggio: ingredienti disponibili = frigo + dispensa. Prima le ricette con 0 mancanti, poi 1, poi 2; a parità, quelle che usano più ingredienti del frigo. Massimo 10. Ogni ricetta restituita indica gli ingredienti **mancanti**.

**Qualità**
- Arresto pulito su `SIGTERM`/`SIGINT` (chiude il server e termina entro pochi secondi): serve a Kubernetes.
- Nessun file scritto su disco durante l'esecuzione.
- Log JSON su standard output: una riga per richiesta con metodo, percorso, stato, durata; per il riconoscimento anche modello e durata.

## Archivio ricette

- `backend/data/recipes.json` e `backend/data/ingredients.json` (vocabolario: nome normalizzato, categoria, sinonimi).
- Almeno **150 ricette** di cucina casalinga italiana, **scritte da te da zero** (non copiare testi da siti o libri). Campi: `id`, `nome`, `categoria`, `tempoMinuti`, `porzioni`, `difficolta`, `ingredienti` (nome dal vocabolario + quantità testuale), `passaggi` (brevi).
- Ogni ingrediente di ogni ricetta deve esistere nel vocabolario.
- Uno script `npm run validate:data` e un test che verificano: struttura valida, id unici, ingredienti tutti nel vocabolario, nessun sinonimo duplicato.

## Frontend — cosa deve fare

- Flusso a schermate: **Foto → Ingredienti → Ricette → Dettaglio ricetta**, con "Nuova foto" sempre raggiungibile.
- **Foto (RF-01), una per ogni ripiano**: i frigoriferi hanno un numero diverso di ripiani, quindi il numero di foto è **variabile**. Si parte con il riquadro "Ripiano 1"; il pulsante "+ Aggiungi ripiano" aggiunge "Ripiano 2", "Ripiano 3"… fino a `MAX_PHOTOS` (letto da `/api/config`). Suggerimento visibile: "Fotografa ogni ripiano da vicino, anche cassetti e sportello". Ogni riquadro ha anteprima, "Rifai" e "Togli" (la numerazione si ricompatta). Ogni riquadro usa `<input type="file" accept="image/*" capture="environment">` più l'opzione galleria. Basta 1 foto per proseguire con "Analizza". Nel telefono, per ogni foto: decodifica, ridimensiona (lato lungo 1280 px), riconverti in **JPEG** con canvas (così anche le foto HEIC di iPhone diventano JPEG).
- **Analisi**: le foto vengono inviate **una alla volta** a `POST /api/recognize` (una richiesta per foto, così ogni chiamata resta entro il timeout); le liste vengono **unite senza doppioni** nel frontend. Se una foto fallisce, le altre restano valide e quella si può riprovare.
- **Attesa**: avanzamento "Ripiano 2 di 5…", animazione leggera; pulsante "Riprova" in caso di errore.
- **Ingredienti (RF-03)**: etichette con ✕ per togliere; campo di aggiunta con suggerimenti da `/api/ingredients`.
- **Dispensa (RF-04)**: pannello per vedere e modificare la dispensa; salvata in `localStorage` (con `try/catch`), valori iniziali da `/api/config`.
- **Ricette (RF-05)**: schede con nome, tempo, difficoltà, badge "hai tutto" oppure "manca: …".
- Le chiamate al backend usano **percorsi relativi** (`/api/...`), mai un indirizzo fisso: in sviluppo usa il proxy di Vite verso `http://localhost:3000`; in produzione ci penserà l'Ingress.
- **PWA**: manifest in italiano, icone (anche `apple-touch-icon`), `theme-color`, meta tag per iOS, installabile su iPhone e Android. Il service worker mette in cache solo l'interfaccia, **mai** le chiamate `/api`.
- Mobile first, da 360 px in su, pulsanti grandi, contrasto adeguato, testi alternativi. Interfaccia in italiano.
- Informativa privacy breve (RF-08): "le foto non vengono salvate".

## Test minimi

- Backend: ogni endpoint (casi validi ed errori), punteggio delle ricette, normalizzazione dei sinonimi, validazione della configurazione, provider `ollama` con Ollama **simulato** (nessuna chiamata di rete vera nei test).
- Frontend: ridimensionamento chiamato prima dell'invio, più foto (numero variabile, limite `MAX_PHOTOS` rispettato) analizzate in sequenza con liste unite senza doppioni, una foto fallita che non blocca le altre, aggiunta/rimozione ingredienti, dispensa salvata, stato di errore con "Riprova".
- `npm test` deve passare in entrambe le cartelle **senza** Ollama acceso.

## Documentazione da scrivere

- `README.md`: cos'è, come avviarlo in locale **senza Docker** (backend in modalità `mock`, poi con Ollama), comandi di test.
- `docs/per-il-devops.md`: **solo informazioni**, nessun file DevOps. Per ciascun componente: versione di Node, comando di installazione delle dipendenze, comando di build e cartella prodotta (frontend), comando di avvio e porta (backend), variabili d'ambiente, endpoint di salute e cosa controllano, cosa deve instradare il reverse proxy (`/` al frontend statico, `/api` al backend; fallback delle route della SPA su `index.html`), dimensione massima delle richieste da permettere.
- `docs/decisioni.md`: brevi ADR delle scelte fatte (es. archivio JSON invece di un database, vocabolario chiuso).

## Fasi

1. Struttura del repository, backend con configurazione, `/api/health` e `/api/ready`, test.
2. Archivio ricette + vocabolario + validazione + `/api/recipes` + `/api/ingredients`.
3. Riconoscimento: provider `mock` e `ollama`, `/api/recognize`, `/api/health/model`.
4. Frontend completo con PWA.
5. Rifinitura: accessibilità, messaggi d'errore, documentazione, `npm run lint` e `npm test` verdi in entrambe le cartelle.

Alla fine di ogni fase: riepilogo in 5 righe, comandi per provarla, commit.

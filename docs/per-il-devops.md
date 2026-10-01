# Informazioni per la parte DevOps

Questo documento contiene **solo informazioni** utili per costruire container, pipeline e manifest.
I file DevOps (Dockerfile, Compose, workflow, manifest Kubernetes, Kustomize, Argo CD, nginx) **non** sono nel
repository di proposito: li scrive Daniel.

## Panoramica

| Componente | Cartella | Tipo | Porta |
|---|---|---|---|
| Frontend | `frontend/` | file statici (SPA + PWA) da servire con un web server | a scelta (es. 8080 in nginx) |
| Backend | `backend/` | processo Node.js (Express) | `3000` (variabile `PORT`) |
| Modello | — | Ollama con un modello di visione | `11434` |

I due progetti sono indipendenti: ognuno ha il proprio `package.json` e `package-lock.json` (niente workspaces),
quindi si possono costruire in due immagini separate con la cartella del componente come contesto.

## Frontend

| Cosa | Valore |
|---|---|
| Versione di Node (solo per la build) | 22 |
| Installazione dipendenze | `npm ci` |
| Build | `npm run build` |
| Cartella prodotta | `frontend/dist/` |
| Test | `npm test` (Vitest + jsdom, nessuna rete) |
| Lint | `npm run lint` |
| Esecuzione | nessun processo Node in produzione: si servono i file di `dist/` |

Contenuto di `dist/`: `index.html`, `assets/` (JS e CSS con hash nel nome), `manifest.webmanifest`, `sw.js`,
`workbox-*.js`, `registerSW.js`, `favicon.svg`, `icons/`.

Indicazioni per chi serve i file statici:

- **Fallback della SPA**: ogni percorso che non è un file esistente deve restituire `index.html`.
- **Cache**: `assets/*` hanno l'hash nel nome e si possono mettere in cache a lungo (es. 1 anno, `immutable`).
  `index.html`, `sw.js`, `registerSW.js` e `manifest.webmanifest` vanno serviti **senza cache lunga**
  (es. `no-cache`), altrimenti gli aggiornamenti dell'app non arrivano ai telefoni.
- **Tipo MIME**: `manifest.webmanifest` → `application/manifest+json`.
- Il frontend chiama il backend **solo con percorsi relativi** (`/api/...`): nessun indirizzo da configurare
  nella build. In sviluppo ci pensa il proxy di Vite verso `http://localhost:3000`.
- Il service worker mette in cache solo l'interfaccia, mai le chiamate `/api`.
- Fotocamera e installazione come PWA richiedono **https** sul telefono (fornito dal tunnel).

## Backend

| Cosa | Valore |
|---|---|
| Versione di Node | 22 |
| Installazione dipendenze | `npm ci --omit=dev` (per i test: `npm ci`) |
| Avvio | `npm start` (equivale a `node src/server.js`) |
| Porta | `3000`, o il valore di `PORT` |
| Test | `npm test` (Vitest + Supertest, Ollama simulato, nessuna rete) |
| Lint | `npm run lint` |
| Controllo dell'archivio | `npm run validate:data` |
| File necessari a runtime | `src/`, `data/`, `package.json`, `package-lock.json`, `node_modules/` |
| Scritture su disco | nessuna (le foto restano in memoria) |
| Log | JSON su standard output, una riga per richiesta |
| Arresto | gestisce `SIGTERM`/`SIGINT`: chiude il server e termina entro 5 secondi |

Il processo non ha bisogno di permessi particolari e può girare come utente non root con filesystem in sola
lettura.

### Variabili d'ambiente

Tutte facoltative. Se un valore non è valido, il processo stampa un errore chiaro ed esce con codice 1.

| Variabile | Predefinito | Significato |
|---|---|---|
| `PORT` | `3000` | porta HTTP |
| `VISION_PROVIDER` | `mock` | `mock` (risposta finta) oppure `ollama` |
| `OLLAMA_URL` | `http://localhost:11434` | indirizzo di Ollama (es. `http://ollama:11434` dentro il cluster) |
| `VISION_MODEL` | `qwen3-vl:4b` | nome del modello in Ollama |
| `VISION_TIMEOUT_MS` | `90000` | tempo massimo di riconoscimento di una foto (1000–600000) |
| `MAX_IMAGE_MB` | `5` | dimensione massima di ogni foto (1–50) |
| `MAX_PHOTOS` | `8` | numero massimo di foto per analisi, comunicato al frontend (1–20) |
| `PANTRY_DEFAULT` | `sale,pepe,olio d'oliva,zucchero,pasta,riso,farina,aceto,acqua` | dispensa predefinita, separata da virgole |
| `RATE_LIMIT_PER_MIN` | `20` | richieste a `/api/recognize` al minuto per IP |
| `LOG_LEVEL` | `info` | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` |

Nessuna variabile è un segreto: vanno bene in una ConfigMap. Il file `backend/.env.example` è solo
documentazione e non viene letto dall'app.

### Endpoint di salute

| Endpoint | Risposta | Cosa controlla | Uso suggerito |
|---|---|---|---|
| `GET /api/health` | 200 `{"status":"ok"}` | solo che il processo risponda; nessuna dipendenza esterna | liveness probe |
| `GET /api/ready` | 200 `{"status":"ready"}` / 503 | che l'archivio ricette sia caricato e valido (subito dopo l'avvio, meno di 1 s) | readiness probe |
| `GET /api/health/model` | 200 / 503 con `reason` | che Ollama risponda **e** che il modello sia scaricato (`/api/tags`, timeout 3 s); con `mock` sempre 200 | controllo dalla pipeline o manuale; **non** come liveness |

Se l'archivio non è valido all'avvio, il processo esce con codice 1 (il Pod andrà in errore invece di restare
"vivo ma inutile").

### Altri endpoint

| Endpoint | Note |
|---|---|
| `GET /api/config` | dispensa predefinita e limiti per il frontend |
| `GET /api/ingredients?q=zuc&limit=10` | suggerimenti per l'autocompletamento |
| `POST /api/recognize` | `multipart/form-data`, campo `image` (JPEG/PNG/WebP). Può durare fino a `VISION_TIMEOUT_MS` |
| `POST /api/recipes` | JSON `{ "ingredients": [...], "pantry": [...] }`, risposta in meno di 1 s |

Codici di errore del riconoscimento: 400 foto mancante, 413 foto troppo grande, 415 formato non valido,
429 troppe richieste, 502 modello non raggiungibile o risposta non valida, 504 tempo scaduto.

## Reverse proxy / Ingress

- `/api` → Service del backend (porta 3000). **Non** riscrivere il percorso: il backend si aspetta `/api/...`.
- `/` → Service del frontend (file statici, con fallback su `index.html`).
- **Dimensione massima delle richieste**: almeno `MAX_IMAGE_MB` + 1 MB (con i predefiniti: **6 MB**).
  Le foto vengono già ridotte nel telefono (in genere 200–600 KB), ma il limite va comunque permesso.
- **Timeout** verso il backend su `/api/recognize`: almeno `VISION_TIMEOUT_MS` + qualche secondo
  (con i predefiniti: **≥ 95 s**), altrimenti il proxy chiude la richiesta prima del backend.
- Il backend usa `trust proxy = 1`: considera l'IP del client dall'header `X-Forwarded-For` impostato
  dal **primo** proxy davanti a lui. Serve al limite di richieste per IP. Se ci sono più proxy in catena
  (es. tunnel → Ingress), il valore va rivisto, altrimenti tutti i client sembrano lo stesso IP.

## Ollama

- API usate: `POST /api/chat` (riconoscimento, con immagine in base64 e `format` JSON) e `GET /api/tags`
  (controllo del modello).
- Il modello va scaricato prima (`ollama pull qwen3-vl:4b`); i file del modello stanno in `~/.ollama`
  dentro il container: è la cartella da rendere persistente.
- Il backend fa una richiesta per foto, quindi con 5 ripiani ci sono 5 chiamate in sequenza da 10–90 s
  ciascuna su CPU.

## Comandi riassuntivi per la pipeline

```bash
# backend
cd backend && npm ci && npm run lint && npm run validate:data && npm test
# frontend
cd frontend && npm ci && npm run lint && npm test && npm run build   # → frontend/dist/
```

# Informazioni per la parte DevOps

Questo documento contiene **solo informazioni** utili per costruire container, pipeline e manifest, senza
dover riaprire il codice. I file DevOps (Dockerfile, `.dockerignore`, Compose, workflow, manifest Kubernetes,
Kustomize, Argo CD, `nginx.conf`) **non** sono nel repository di proposito: li scrive Daniel.

Valori verificati sul codice e sul processo reale l'8 ottobre 2026 (Node 22.23, `main` a `b92c52b`).

## Panoramica

| Componente | Cartella | Cosa gira in produzione | Porta |
|---|---|---|---|
| Frontend | `frontend/` | **nessun processo Node**: file statici (SPA + PWA) serviti da nginx | a scelta (es. `8080` per nginx non root) |
| Backend | `backend/` | processo Node.js 22 (Express) | `3000` (variabile `PORT`) |
| Modello | — | **Google Gemini** via API HTTPS: nessun container, nessun volume, nessuna GPU | `443` in uscita |

I due progetti sono indipendenti: ognuno ha il proprio `package.json` e `package-lock.json` (niente
workspaces), quindi si costruiscono in **due immagini separate** usando la cartella del componente come
contesto di build (`docker build frontend/`, `docker build backend/`).

La versione di Node è fissata in `.nvmrc` (`22`) alla radice e in `engines` (`>=22`) dei due `package.json`.

## Frontend

| Cosa | Valore |
|---|---|
| Versione di Node | **22**, serve **solo per la build** (nell'immagine finale c'è solo nginx) |
| Installazione dipendenze | `npm ci` (servono anche le devDependencies: Vite è lì) |
| Build | `npm run build` (≈ 1 s) |
| Cartella prodotta | **`frontend/dist/`** ← è quella da copiare nella cartella servita da nginx |
| Test | `npm test` (Vitest + jsdom, nessuna rete) |
| Lint | `npm run lint` |
| Configurazione a runtime | **nessuna**: niente variabili d'ambiente, niente indirizzo del backend nella build |

Contenuto di `dist/` (circa 300 KB in tutto):

```
index.html              manifest.webmanifest    sw.js            workbox-<hash>.js
registerSW.js           favicon.svg             icons/           assets/index-<hash>.js|css
```

Indicazioni per chi serve i file statici (nginx):

- **Va servito alla radice `/`** del dominio: il manifest ha `start_url` e `scope` = `/` e il service worker
  usa `/index.html`. Non pubblicarlo sotto un sottopercorso (es. `/frigochef/`).
- **Fallback della SPA**: ogni percorso che non è un file esistente deve restituire `index.html`
  (in nginx: `try_files $uri $uri/ /index.html;`). Il fallback **non** deve valere per `/api/`.
- **Cache**:
  - `assets/*` hanno l'hash nel nome → cache lunga (es. 1 anno, `immutable`);
  - `index.html`, `sw.js`, `registerSW.js`, `manifest.webmanifest` → **`no-cache`**, altrimenti gli
    aggiornamenti dell'app non arrivano ai telefoni.
- **Tipo MIME**: `manifest.webmanifest` → `application/manifest+json` (nginx di base non lo conosce).
- Il frontend chiama il backend **solo con percorsi relativi** (`/api/...`): frontend e backend devono essere
  raggiungibili dallo **stesso host** (stessa origine). In sviluppo ci pensa il proxy di Vite verso
  `http://localhost:3000`.
- Il service worker mette in cache solo l'interfaccia, **mai** le chiamate `/api`.
- Fotocamera e installazione come PWA richiedono **https** sul telefono (fornito dal tunnel).
- Nessuna risorsa esterna (CDN, font, script di terzi): l'immagine non ha bisogno di uscire su Internet.

## Backend

| Cosa | Valore |
|---|---|
| Versione di Node | **22** |
| Installazione dipendenze | produzione: `npm ci --omit=dev` (≈ 16 MB di `node_modules`); per test e lint: `npm ci` |
| Avvio | `npm start` = `node --env-file-if-exists=.env src/server.js` |
| Avvio consigliato nel container | **`node src/server.js`** direttamente (vedi sotto) |
| Porta | **`3000`**, o il valore di `PORT` |
| Test | `npm test` (Vitest + Supertest, Gemini e Ollama simulati, nessuna rete) |
| Lint | `npm run lint` |
| Controllo dell'archivio | `npm run validate:data` |
| File necessari a runtime | `src/`, `data/`, `package.json`, `node_modules/` (di produzione) |
| File da **non** copiare | `.env` (contiene la chiave in sviluppo!), `test/`, `scripts/`, `node_modules/` locale, `eslint.config.js`, `vitest.config.js` |
| Tempo di avvio | ≈ 0,3 s fino a `/api/ready` = 200 |
| Memoria misurata | ≈ 83 MB RSS a riposo, ≈ 94 MB dopo 15 foto + 200 ricerche |
| Log | JSON su standard output, una riga per richiesta (`method`, `path`, `status`, `durationMs`; per il riconoscimento anche `model`, `recognitionMs`) → `kubectl logs` |
| Arresto | gestisce `SIGTERM`/`SIGINT`: smette di accettare connessioni, chiude il server ed esce con 0 (misurato: 12 ms); se restano connessioni aperte esce comunque dopo **5 s** |
| `NODE_ENV` | non usato dal codice (impostarlo a `production` non fa danni) |

Perché `node src/server.js` invece di `npm start` nel container: con `npm` in mezzo c'è un processo in più tra
il runtime e Node, e il segnale `SIGTERM` di Kubernetes arriva prima a npm. Con `node` come processo
principale lo riceve direttamente il server, che si chiude in modo pulito. Il flag `--env-file-if-exists`
serve solo in sviluppo: nel container la configurazione arriva dalle variabili d'ambiente.

### Disco e volumi

- **Il backend non scrive nessun file su disco**: le foto restano in memoria (`multer.memoryStorage`) solo per
  la durata dell'analisi; l'archivio ricette (`data/*.json`) viene **letto** una volta all'avvio. Verificato:
  dopo avvio, richieste e arresto `git status` resta pulito e nel codice non ci sono scritture.
- Quindi può girare come **utente non root** con **filesystem in sola lettura**
  (`readOnlyRootFilesystem: true`) e **non serve nessun volume** né `/tmp` scrivibile.
- **Nessun PersistentVolumeClaim**: con Gemini il modello è un servizio esterno. Il PVC per i file del modello
  previsto nell'analisi funzionale (§7) serviva solo per Ollama, che non usiamo.
- Il backend è **senza stato** (nessuna sessione, nessun database): si possono avere più repliche. Unica nota:
  il limite di richieste per IP (`RATE_LIMIT_PER_MIN`) è tenuto in memoria **per replica**.

### Variabili d'ambiente

Sono tutte facoltative tranne `GEMINI_API_KEY` quando `VISION_PROVIDER=gemini`. Una stringa vuota vale come
"non impostata". Se un valore non è valido, o se manca la chiave, il processo scrive un errore chiaro su
stderr (es. `Configurazione non valida: - PORT deve essere un numero intero`) ed **esce con codice 1**:
in Kubernetes il Pod va in `CrashLoopBackOff` e il motivo si legge con `kubectl logs`.

| Variabile | Predefinito | Valori ammessi | Significato | Dove in Kubernetes |
|---|---|---|---|---|
| `PORT` | `3000` | 1–65535 | porta HTTP del backend | ConfigMap (o lasciare il predefinito) |
| `VISION_PROVIDER` | `mock` | `mock`, `gemini`, `ollama` | chi riconosce gli ingredienti: `mock` risposta finta, `gemini` quello da usare nel cluster, `ollama` modello locale (solo con GPU) | ConfigMap → **`gemini`** |
| `GEMINI_API_KEY` | — | stringa | chiave dell'API Gemini, obbligatoria con `gemini` | **Secret** |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | minuscole, cifre, `.`, `-` | modello Gemini | ConfigMap |
| `VISION_TIMEOUT_MS` | `90000` | 1000–600000 | tempo massimo per riconoscere una foto | ConfigMap |
| `MAX_IMAGE_MB` | `5` | 1–50 | dimensione massima di ogni foto | ConfigMap |
| `MAX_PHOTOS` | `8` | 1–20 | numero massimo di foto (ripiani) per analisi, comunicato al frontend da `/api/config` | ConfigMap |
| `PANTRY_DEFAULT` | `sale,pepe,olio d'oliva,zucchero,pasta,riso,farina,aceto,acqua` | elenco separato da virgole | dispensa predefinita proposta ai nuovi utenti | ConfigMap (attenzione all'apostrofo in YAML: usare le virgolette doppie) |
| `RATE_LIMIT_PER_MIN` | `20` | 1–10000 | richieste a `/api/recognize` al minuto per IP | ConfigMap |
| `LOG_LEVEL` | `info` | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` | livello dei log | ConfigMap |
| `OLLAMA_URL` | `http://localhost:11434` | URL http/https | indirizzo di Ollama (solo con `ollama`) | non serve con Gemini |
| `VISION_MODEL` | `qwen3-vl:4b` | stringa | modello in Ollama (solo con `ollama`) | non serve con Gemini |

`backend/.env.example` elenca le stesse variabili ed è solo documentazione. In sviluppo si copia in
`backend/.env` (ignorato da git), che `npm run dev` e `npm start` leggono se esiste; nell'immagine `.env`
**non** va copiato.

### Segreti e configurazione

| Tipo | Variabili | Oggetto Kubernetes |
|---|---|---|
| **Segreto** | `GEMINI_API_KEY` | **Secret** (es. `env.valueFrom.secretKeyRef`), creato a mano o da uno strumento per segreti: **mai** in git, nella ConfigMap, nell'immagine o nei log della pipeline |
| Configurazione normale | `VISION_PROVIDER`, `GEMINI_MODEL`, `VISION_TIMEOUT_MS`, `MAX_IMAGE_MB`, `MAX_PHOTOS`, `PANTRY_DEFAULT`, `RATE_LIMIT_PER_MIN`, `LOG_LEVEL` (e `PORT` se si cambia) | **ConfigMap** (es. `envFrom.configMapRef`) |
| Frontend | nessuna variabile | — |

`GEMINI_API_KEY` è **l'unico segreto** dell'app. Il backend non la scrive mai nei log (non compare neanche
nell'oggetto di configurazione serializzato) e la manda a Google solo nell'header `x-goog-api-key`, mai
nell'URL. La pipeline (test, lint, build) **non** ne ha bisogno: i test simulano Gemini.

### Endpoint di salute e probe

| Endpoint | Risposta | Cosa controlla | Probe Kubernetes |
|---|---|---|---|
| `GET /api/health` | sempre 200 `{"status":"ok"}` | solo che il processo risponda; **nessuna** dipendenza esterna | **livenessProbe** |
| `GET /api/ready` | 200 `{"status":"ready"}`, oppure 503 `{"status":"not-ready"}` | che l'archivio ricette sia caricato e valido (succede ≈ 0,3 s dopo l'avvio) | **readinessProbe** |
| `GET /api/health/model` | 200 `{"status":"ok","provider","model"}`, oppure 503 con `reason` | Gemini: che chiave e modello siano validi (legge i metadati del modello, timeout 5 s, **non** consuma la quota di analisi); Ollama: che risponda e abbia il modello (timeout 3 s); `mock`: sempre 200 | **nessuna**: solo smoke test dopo il deploy o controllo manuale |

Perché `/api/health/model` **non** deve diventare una probe: dipende da Internet e da Google. Se Gemini ha un
problema, una liveness riavvierebbe all'infinito Pod sani e una readiness toglierebbe dal Service anche la
ricerca ricette, che invece funziona senza il modello.

Valori indicativi: la porta delle probe è `3000` (o `PORT`); `initialDelaySeconds` può restare basso
(l'avvio richiede meno di 1 s); `timeoutSeconds: 1–2` basta perché entrambi gli endpoint rispondono in
pochi millisecondi senza chiamate esterne.

All'avvio, con `gemini` o `ollama`, il backend fa **una volta** lo stesso controllo di `/api/health/model` e
scrive nei log `modello di visione raggiungibile`, oppure un `warn` con il motivo (es.
`chiave GEMINI_API_KEY non valida`), **senza fermarsi**. Se invece l'archivio ricette non è valido, il processo
esce con codice 1 (il Pod va in errore invece di restare "vivo ma inutile").

### Altri endpoint

| Endpoint | Note |
|---|---|
| `GET /api/config` | dispensa predefinita e limiti per il frontend |
| `GET /api/ingredients?q=zuc&limit=10` | suggerimenti per l'autocompletamento |
| `POST /api/recognize` | `multipart/form-data`, campo `image` (JPEG/PNG/WebP, max `MAX_IMAGE_MB`). Può durare fino a `VISION_TIMEOUT_MS` |
| `POST /api/recipes` | JSON `{ "ingredients": [...], "pantry": [...] }` (max 100 KB), risposta in pochi millisecondi |

Tutte le route tranne `/api/health`, `/api/ready`, `/api/health/model` e `/api/config` rispondono 503
`NOT_READY` finché l'archivio non è caricato.

Codici di errore del riconoscimento: 400 foto mancante, 413 foto troppo grande, 415 formato non valido,
429 troppe richieste (`TOO_MANY_REQUESTS`, limite per IP del backend) oppure limite del piano gratuito di
Gemini (`VISION_QUOTA`), 502 modello non raggiungibile, chiave Gemini non valida (`VISION_AUTH`) o risposta
non valida, 503 Gemini sovraccarico (`VISION_BUSY`), 504 tempo scaduto. Nel corpo c'è sempre
`{"error": {"code", "message"}}` con un messaggio in italiano per l'utente.

## Reverse proxy / Ingress

| Percorso | Destinazione | Note |
|---|---|---|
| `/api` e `/api/*` | Service del **backend**, porta `3000` | **non** riscrivere il percorso: il backend si aspetta `/api/...` |
| `/` (tutto il resto) | Service del **frontend** (nginx) | nginx fa il fallback su `index.html` per le route della SPA |

- **Dimensione massima delle richieste**: almeno `MAX_IMAGE_MB` + 1 MB, quindi con i predefiniti
  **6 MB** (in nginx `client_max_body_size 6m`; in un Ingress va impostato con l'annotazione o il
  middleware del controller usato). Le foto vengono già ridotte nel telefono (768 px, di solito 50–150 KB), ma
  il limite va comunque permesso. Il backend rifiuta da solo le foto oltre `MAX_IMAGE_MB` (413) e i JSON
  oltre 100 KB.
- **Timeout** verso il backend su `/api/recognize`: almeno `VISION_TIMEOUT_MS` + qualche secondo
  (con i predefiniti **≥ 95 s**), altrimenti il proxy chiude la richiesta prima del backend. Con Gemini
  una foto richiede di solito 1–2 s, ma il timeout copre i rallentamenti del servizio.
- **IP del client**: il backend usa `trust proxy = 1`, cioè prende l'IP del client dall'header
  `X-Forwarded-For` aggiunto dal **primo** proxy davanti a lui. Serve al limite di richieste per IP. Se ci sono
  più proxy in catena (es. cloudflared → Ingress → backend) tutti i client possono sembrare lo stesso IP: in
  quel caso il limite scatta per tutti insieme. Va verificato nei log una volta montata la catena.
- Frontend e backend devono stare sotto **lo stesso host** (il frontend usa percorsi relativi, e il backend
  non ha CORS).

## Rete in uscita

- Con `VISION_PROVIDER=gemini` il backend fa richieste HTTPS verso
  **`generativelanguage.googleapis.com:443`**: `POST /v1beta/models/{GEMINI_MODEL}:generateContent`
  (riconoscimento, immagine inline in base64) e `GET /v1beta/models/{GEMINI_MODEL}` (controllo).
  Se si aggiunge una NetworkPolicy di egress, vanno permessi questo host e il DNS.
- Il frontend (nginx) non ha bisogno di uscire su Internet.

## Gemini

- La chiave si crea su <https://aistudio.google.com/apikey>. Piano gratuito: limiti di richieste al minuto e
  al giorno (si vedono in AI Studio); oltre il limite il backend risponde 429 `VISION_QUOTA` con un messaggio
  "Riprova tra N secondi".
- Le foto escono dal cluster verso Google (vedi ADR-011 in `docs/decisioni.md`).

## Ollama (alternativa, solo con GPU)

Non usato nel cluster. Sul PC di sviluppo, solo CPU, un modello da 3b impiega 2–3 minuti per foto (vedi
`docs/valutazione-modello.md`): ha senso solo su una macchina con GPU. In quel caso: `VISION_PROVIDER=ollama`,
`OLLAMA_URL=http://ollama:11434`, modello scaricato prima (`ollama pull`), cartella `~/.ollama` del container
da rendere persistente con un PVC.

## Comandi riassuntivi per la pipeline

```bash
# backend
cd backend && npm ci && npm run lint && npm run validate:data && npm test
# frontend
cd frontend && npm ci && npm run lint && npm test && npm run build   # → frontend/dist/
```

Nessuno di questi comandi usa la rete (a parte `npm ci`) né richiede `GEMINI_API_KEY`.

# FrigoChef

Web app per telefono (iPhone e Android): fotografi i ripiani del frigo, un modello di visione (Google Gemini)
riconosce gli ingredienti, correggi la lista e l'app ti propone ricette dal suo archivio.

È un progetto di portfolio **DevOps**: questo repository contiene il codice dell'app; container, pipeline,
Kubernetes e GitOps sono costruiti a parte (vedi [`docs/per-il-devops.md`](docs/per-il-devops.md)).

- Requisiti: [`docs/analisi-funzionale.md`](docs/analisi-funzionale.md)
- Scelte progettuali: [`docs/decisioni.md`](docs/decisioni.md)
- Prova dei modelli di visione: [`docs/valutazione-modello.md`](docs/valutazione-modello.md)

## Com'è fatto

| Cartella | Cosa contiene |
|---|---|
| `backend/` | API Node.js 22 + Express: riconoscimento (provider `mock`, `gemini` o `ollama`), ricerca ricette, endpoint di salute |
| `backend/data/` | archivio di 204 ricette di cucina casalinga italiana e vocabolario di 141 ingredienti con sinonimi |
| `frontend/` | PWA React + Vite: foto per ripiano, lista ingredienti, dispensa, ricette |

Flusso: **Foto** (una per ripiano) → **Ingredienti** (modificabili) → **Ricette** → **Dettaglio ricetta**.
Le foto vengono ridotte a 768 px e convertite in JPEG nel telefono, poi inviate una alla volta a
`POST /api/recognize`; il modello elenca gli alimenti, il backend tiene solo quelli del vocabolario
(con i sinonimi) e le liste vengono unite senza doppioni. Le ricette non sono generate dall'AI: arrivano
dall'archivio locale, ordinate per ingredienti mancanti.

## Avvio in locale (senza Docker)

Serve **Node.js 22** (`nvm use` legge `.nvmrc`). Le dipendenze si installano con `npm ci`, che usa
esattamente le versioni di `package-lock.json` senza modificarlo.

### 1. Backend in modalità `mock` (senza modello)

```bash
cd backend
npm ci
npm run dev            # http://localhost:3000, VISION_PROVIDER=mock è il predefinito
```

Prova veloce:

```bash
curl localhost:3000/api/health
curl localhost:3000/api/ready
curl "localhost:3000/api/ingredients?q=zuc"
curl -X POST localhost:3000/api/recipes -H 'Content-Type: application/json' \
  -d '{"ingredients":["uova","zucchine"],"pantry":["sale","olio d'"'"'oliva"]}'
curl -F image=@foto.jpg localhost:3000/api/recognize
```

### 2. Frontend

In un altro terminale:

```bash
cd frontend
npm ci
npm run dev            # http://localhost:5173, le chiamate /api vanno al backend tramite il proxy di Vite
```

Per provarlo dal telefono sulla stessa rete Wi-Fi: `npm run dev -- --host` e apri l'indirizzo mostrato.
La fotocamera e l'installazione come app richiedono **https** (tranne che su `localhost`): sul telefono puoi
comunque scegliere le foto dalla galleria. L'https vero arriva con il tunnel (vedi `docs/per-il-devops.md`).

Versione di produzione in locale:

```bash
npm run build && npm run preview   # http://localhost:4173, con proxy /api verso localhost:3000
```

### 3. Backend con Google Gemini

Crea una chiave gratuita su <https://aistudio.google.com/apikey> e mettila in `backend/.env`
(ignorato da git, mai da committare):

```bash
cd backend
echo 'GEMINI_API_KEY=la-tua-chiave' > .env && chmod 600 .env
VISION_PROVIDER=gemini npm run dev      # npm run dev/start leggono .env se esiste
curl localhost:3000/api/health/model    # 200 se chiave e modello sono validi (non consuma quota)
curl -F image=@foto.jpg localhost:3000/api/recognize
```

Il frontend non cambia: se `npm run dev` del frontend è già acceso, basta ricaricare la pagina.
Il modello predefinito è `gemini-3.5-flash-lite` (`GEMINI_MODEL` per cambiarlo). Senza chiave, con
`VISION_PROVIDER=gemini` il backend non parte. Oltre i limiti del piano gratuito risponde 429 con il tempo
di attesa.

### 4. Backend con Ollama (solo con GPU)

Su CPU un modello locale impiega minuti per foto (vedi `docs/valutazione-modello.md`). Con una GPU:

```bash
ollama pull qwen2.5vl:3b
cd backend
VISION_PROVIDER=ollama VISION_MODEL=qwen2.5vl:3b npm run dev
curl localhost:3000/api/health/model   # 200 se Ollama risponde e il modello è scaricato
```

Tutte le variabili sono in [`backend/.env.example`](backend/.env.example). Il backend legge le variabili
d'ambiente; in sviluppo `npm run dev` e `npm start` caricano anche `backend/.env`, se c'è.

### Valutare il modello sulle tue foto

```bash
cd backend
node --env-file-if-exists=.env scripts/valuta-modello.js --provider gemini --dir ../test-foto/768
```

Le foto e il riferimento `atteso.json` stanno in `test-foto/`, fuori da git: vedi `docs/valutazione-modello.md`.

## Test e controlli

```bash
cd backend && npm test && npm run lint && npm run validate:data
cd frontend && npm test && npm run lint && npm run build
```

I test non usano la rete, Gemini né Ollama: il modello è simulato.

## Privacy

Con `VISION_PROVIDER=gemini` **le foto vengono inviate a Google Gemini per l'analisi**; FrigoChef non le
salva: restano in memoria solo il tempo dell'analisi e non vengono scritte nei log. Per il piano gratuito
valgono i termini di Google sull'uso dei contenuti inviati (vedi ADR-011). Nessun cookie di tracciamento;
la dispensa è salvata solo nel telefono.

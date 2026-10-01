# FrigoChef

Web app per telefono (iPhone e Android): fotografi i ripiani del frigo, un modello di visione open source
riconosce gli ingredienti, correggi la lista e l'app ti propone ricette dal suo archivio.

È un progetto di portfolio **DevOps**: questo repository contiene il codice dell'app; container, pipeline,
Kubernetes e GitOps sono costruiti a parte (vedi [`docs/per-il-devops.md`](docs/per-il-devops.md)).

- Requisiti: [`docs/analisi-funzionale.md`](docs/analisi-funzionale.md)
- Scelte progettuali: [`docs/decisioni.md`](docs/decisioni.md)

## Com'è fatto

| Cartella | Cosa contiene |
|---|---|
| `backend/` | API Node.js 22 + Express: riconoscimento (provider `mock` o `ollama`), ricerca ricette, endpoint di salute |
| `backend/data/` | archivio di 204 ricette di cucina casalinga italiana e vocabolario di 141 ingredienti con sinonimi |
| `frontend/` | PWA React + Vite: foto per ripiano, lista ingredienti, dispensa, ricette |

Flusso: **Foto** (una per ripiano) → **Ingredienti** (modificabili) → **Ricette** → **Dettaglio ricetta**.
Le foto vengono ridotte a 1280 px e convertite in JPEG nel telefono, poi inviate una alla volta a
`POST /api/recognize`; le liste vengono unite senza doppioni. Le ricette non sono generate dall'AI: arrivano
dall'archivio locale, ordinate per ingredienti mancanti.

## Avvio in locale (senza Docker)

Serve **Node.js 22** (`nvm use` legge `.nvmrc`).

### 1. Backend in modalità `mock` (senza modello)

```bash
cd backend
npm install
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
npm install
npm run dev            # http://localhost:5173, le chiamate /api vanno al backend tramite il proxy di Vite
```

Per provarlo dal telefono sulla stessa rete Wi-Fi: `npm run dev -- --host` e apri l'indirizzo mostrato.
La fotocamera e l'installazione come app richiedono **https** (tranne che su `localhost`): sul telefono puoi
comunque scegliere le foto dalla galleria. L'https vero arriva con il tunnel (vedi `docs/per-il-devops.md`).

Versione di produzione in locale:

```bash
npm run build && npm run preview   # http://localhost:4173, con proxy /api verso localhost:3000
```

### 3. Backend con Ollama

Installa [Ollama](https://ollama.com) e scarica un modello di visione:

```bash
ollama pull qwen3-vl:4b          # oppure qwen3-vl:2b se la RAM non basta
cd backend
VISION_PROVIDER=ollama npm run dev
curl localhost:3000/api/health/model   # 200 se Ollama risponde e il modello è scaricato
```

Tutte le variabili sono in [`backend/.env.example`](backend/.env.example) (il backend legge solo variabili
d'ambiente: il file è documentazione, non viene caricato).

## Test e controlli

```bash
cd backend && npm test && npm run lint && npm run validate:data
cd frontend && npm test && npm run lint && npm run build
```

I test non usano la rete né Ollama: il modello è simulato.

## Privacy

Le foto restano in memoria solo il tempo dell'analisi: non vengono salvate né scritte nei log.
Nessun cookie di tracciamento, nessun servizio esterno; la dispensa è salvata solo nel telefono.

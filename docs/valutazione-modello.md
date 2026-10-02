# Valutazione del modello di visione

Come si misura il riconoscimento sulle foto vere e cosa è uscito dalla prova del 2 ottobre 2026.
La decisione che ne deriva è l'ADR-011 in [`decisioni.md`](decisioni.md).

## Come si ripete la prova

Le foto e il riferimento stanno in `test-foto/`, che è **fuori da git** (foto private):

```
test-foto/
├── atteso.json        { "frigo1.jpg": ["uova", "yogurt greco"], ... }   nomi del vocabolario o sinonimi
├── frigo1.jpg
└── frigo2.jpg
```

Per misurare quello che riceve davvero il backend, le foto vanno ridotte come fa il telefono (768 px sul lato
lungo), per esempio in `test-foto/768/` con una copia di `atteso.json`.

```bash
cd backend
# Gemini: la chiave arriva da backend/.env (GEMINI_API_KEY) e non viene stampata
node --env-file-if-exists=.env scripts/valuta-modello.js --provider gemini --dir ../test-foto/768
node --env-file-if-exists=.env scripts/valuta-modello.js --provider gemini --model gemini-3.1-flash-lite --dir ../test-foto/768
# Ollama (modello già scaricato)
node scripts/valuta-modello.js --provider ollama --model qwen2.5vl:3b --dir ../test-foto/768
# --json risultati.json salva anche il dettaglio per foto
```

Per ogni foto lo script stampa il tempo e confronta gli ingredienti trovati con `atteso.json`:

- **giusti**: trovati e attesi;
- **inventati**: trovati, nel vocabolario, ma non attesi;
- **mancanti**: attesi ma non trovati;
- **scartati**: nomi dati dal modello che non sono nel vocabolario (es. "bibita", "bottarga"), quindi tolti
  dal backend; non contano come errori.

Nel riepilogo, **precisione** = giusti / (giusti + inventati) e **ritrovamento** = giusti / (giusti + mancanti).

## Foto e riferimento usati

Due foto di ripiani scattate con il telefono (1200 × 1600 px), ridotte a 576 × 768 px.

| Foto | Atteso (dal vocabolario) | Altro visibile, non nel vocabolario |
|---|---|---|
| `frigo1.jpg` | uova, yogurt greco, pancetta a cubetti, prosciutto crudo | Coca-Cola, succhi, birra |
| `frigo2.jpg` | yogurt greco, maionese | bottarga, succhi ACE, vino, Aperol, acqua tonica |

Il campione è piccolo: i numeri servono a confrontare i modelli, non a stimare l'accuratezza in generale.

## Ambiente

- PC: Intel i5-8365U (4 core / 8 thread, portatile a basso consumo), nessuna GPU, Windows 11 + WSL2 con 7,7 GB.
- Ollama 0.35.0, modelli quantizzati Q4_K_M, solo CPU.
- Timeout dell'app: 90 s per foto (`VISION_TIMEOUT_MS`); nello script 300 s.

## Risultati: modelli locali (Ollama, CPU)

| Modello | Prompt | Foto | Tempo per foto | Giusti / attesi | Note |
|---|---|---|---|---|---|
| `qwen3-vl:2b` | con vocabolario | originali | > 300 s (timeout) | 0 / 6 | variante "thinking": ragiona all'infinito, anche con `think: false` |
| `qwen3-vl:2b-instruct` | con vocabolario | 640 e 1280 px | 158–177 s | — | ricopia il vocabolario (50+ voci) |
| `qwen2.5vl:3b` | con vocabolario | originali | > 300 s (timeout) | — | prova interrotta: memoria del PC esaurita |
| `qwen2.5vl:3b` | corto | 768 px | 138 s / 158 s | 1 / 6 | frigo2: risposta in ciclo ("miele, miele…") troncata a 150 token |

Dove va il tempo (chiamata diagnostica, `qwen2.5vl:3b`, frigo2 a 768 px): 1133 token di prompt letti in
181 s (~6 token/s), 150 token generati in 23 s, totale 213 s. Con il vocabolario nel prompt (`qwen3-vl:2b`)
il prompt era di 2562 token, letti in 203 s.

## Risultati: Gemini (cloud, piano gratuito)

Prompt corto, risposta JSON con schema, `temperature` 0, ragionamento "minimal".

| Modello | Foto | Tempo per foto | Giusti | Inventati | Mancanti | Precisione | Ritrovamento |
|---|---|---|---|---|---|---|---|
| **`gemini-3.5-flash-lite`** | 768 px | 1,1 s | 6 | 1 (latte) | 0 | 86% | 100% |
| `gemini-3.5-flash-lite` | originali | 1,6–1,7 s | 6 | 0 | 0 | 100% | 100% |
| `gemini-3.1-flash-lite` | 768 px | 4,4–10,9 s | 6 | 1 (passata di pomodoro) | 0 | 86% | 100% |

Scartati da `gemini-3.5-flash-lite` (a 768 px): "bibita", "succo", "bottiglia". Il "latte" inventato sono i
cartoni di succo ACE, che da fuori somigliano a cartoni di latte; l'utente lo toglie dalla lista (RF-03).

Altri modelli Flash elencati dall'API ma non usati:

- `gemini-3.8-flash`: non accetta il ragionamento "minimal" e durante la prova era sovraccarico (503);
- `gemini-2.5-flash` e `gemini-2.5-flash-lite`: non più disponibili per le chiavi nuove (404);
- versioni `preview` e modelli per immagini o voce: non adatti a un servizio stabile.

Dimensione delle foto: con `gemini-3.5-flash-lite` il prompt vale 1136 token sia a 768 sia a 1280 px, e a
1280 px il risultato non è migliore (frigo1: prosciutto crudo mancante, "salame" in più). Per questo il
frontend riduce le foto a 768 px.

## Scelta

`gemini-3.5-flash-lite`: stesso risultato del 3.1, ma molto più veloce, e versione stabile (non `preview`).
Si cambia con `GEMINI_MODEL` senza toccare il codice; dopo un cambio conviene ripetere questa prova.

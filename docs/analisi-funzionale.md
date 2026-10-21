# FrigoChef — Analisi funzionale v0.3

Web app per telefono (**iPhone e Android**): fotografi l'interno del frigo, un modello di intelligenza artificiale open source riconosce gli ingredienti, tu correggi la lista e l'app ti propone le ricette che puoi fare.
Progetto del portfolio di Daniel Balloi: il valore dimostrato è la parte **DevOps** (container, pipeline, Kubernetes, GitOps), non l'app in sé.

**Novità (v0.2–v0.3):** **una foto per ogni ripiano**, quanti ne ha il frigo · funziona su iPhone e Android · ricette da un **archivio locale** (non inventate dall'AI) · **dispensa** data per scontata (olio, sale, pepe, zucchero, pasta…) · modello scelto in base alla RAM (7,7 GB in WSL) · cluster **k3d** · nome definitivo **FrigoChef**.

## 1. Obiettivi

| Obiettivo | Come si misura |
|---|---|
| App utile e semplice da provare | da iPhone o Android: foto → ingredienti → ricette in meno di 1 minuto, senza istruzioni |
| **Costo zero** | nessun servizio a pagamento, nessuna carta di credito, nessuna chiave API |
| Dimostrare competenze DevOps diverse da Balloi e dal portfolio | Kubernetes, GitOps (Argo CD), modello AI in container, esposizione sicura con tunnel |
| Dimostrabile | video degli episodi + prova dal vivo dal telefono del selezionatore quando il PC è acceso |

## 2. Vincoli

- **Tutto gratuito**: modello AI open source in locale; archivio ricette incluso nel progetto; Kubernetes locale; GitHub Actions e GitHub Container Registry gratuiti per repository pubblici; tunnel Cloudflare gratuito.
- **iPhone (Safari) e Android (Chrome)**, come web app installabile sulla schermata home (PWA). Serve **https**, fornito dal tunnel.
- **Codice in JavaScript / Node.js** (coerente con gli altri progetti).
- **Nessuna API esterna**, né per l'AI né per le ricette.
- L'app è disponibile **solo quando il PC di Daniel è acceso** (limite accettato: è una demo di portfolio).

## 3. Utenti e scenari

- **Utente**: chiunque, dal telefono, davanti al frigo. Nessun account.
- **Recruiter / tecnico**: guarda i video sul portfolio; su richiesta, Daniel accende l'ambiente e il selezionatore prova l'app **dal proprio telefono**.

## 4. Requisiti funzionali (prima versione)

**RF-01 — Una foto per ogni ripiano.** I frigoriferi hanno un numero diverso di ripiani (3, 5…): l'utente fotografa **ogni ripiano**, più eventualmente cassetti e sportello. Parte con il riquadro "Ripiano 1" e aggiunge gli altri con "+ Aggiungi ripiano" (numerati in automatico, massimo configurabile, predefinito 8). Ogni scatto apre la fotocamera posteriore o la galleria; si può rifare o togliere una foto; basta 1 foto per proseguire.
- Perché: da vicino il modello riconosce molto meglio che da una foto dell'intero frigo.
- Le foto vengono analizzate una alla volta; le liste di ingredienti vengono **unite senza doppioni**.
- Criteri: funziona su Safari iPhone e Chrome Android; l'immagine viene ridotta e convertita in JPEG nel telefono prima dell'invio (lato lungo massimo circa 1280 px); se la foto non si può leggere, messaggio chiaro.

**RF-02 — Riconoscimento degli ingredienti.** Il backend passa l'immagine al modello di visione, chiedendogli di scegliere gli ingredienti **dal vocabolario dell'archivio ricette** (così i nomi coincidono con quelli delle ricette).
- Criteri: stato di attesa visibile ("Sto guardando nel frigo…"); timeout configurabile con errore chiaro e pulsante "Riprova".

**RF-03 — Lista ingredienti modificabile.** Gli ingredienti riconosciuti appaiono come etichette: l'utente **toglie** quelli sbagliati e **aggiunge** quelli mancanti scrivendo, con suggerimenti dal vocabolario (es. scrivo "zuc" → "zucchine").
- Criteri: aggiunta e rimozione con un tocco; almeno 1 ingrediente per proseguire.

**RF-04 — Dispensa data per scontata.** Alcuni ingredienti si considerano **sempre disponibili**: sale, pepe, olio d'oliva, zucchero, pasta, riso, farina, aceto, acqua. L'utente può vedere e modificare la propria dispensa; la scelta resta salvata **nel telefono**.
- La lista predefinita è configurabile lato server (variabile d'ambiente, poi ConfigMap in Kubernetes).

**RF-05 — Ricette possibili.** Pulsante "Cosa cucino?": il backend cerca nell'**archivio ricette** quelle realizzabili con ingredienti del frigo + dispensa.
- Ordinamento: prima le ricette **senza ingredienti mancanti**, poi quelle con 1 o 2 mancanti (evidenziati). Massimo 10 risultati.
- Per ogni ricetta: nome, tempo, porzioni, difficoltà, ingredienti (con quelli **mancanti** evidenziati), passaggi.
- Nessuna ricetta trovata → messaggio e suggerimento di aggiungere ingredienti.
- Le ricette **non sono generate dall'AI**: sono affidabili, istantanee e non consumano RAM.

**RF-06 — Nuova foto.** Pulsante per ricominciare da capo.

**RF-07 — Stato del servizio.** `/api/health` (il processo è vivo), `/api/ready` (pronto a servire: archivio caricato), `/api/health/model` (il modello risponde). Servono a Kubernetes (probe) e alla pipeline.

**RF-08 — Privacy.** Le foto vengono inviate a **Google Gemini** per l'analisi (ADR-011); FrigoChef **non le salva**: restano in memoria solo il tempo dell'analisi. Nessun cookie di tracciamento. Informativa breve nella pagina: "le foto vengono inviate a Google Gemini per l'analisi; FrigoChef non le salva".

## 5. Archivio ricette

| Aspetto | Scelta |
|---|---|
| Fonte | **archivio proprio**, file JSON nel repository, scritto da zero (niente copia da siti o libri) |
| Contenuto | almeno **150 ricette** di cucina casalinga italiana (primi, secondi, contorni, piatti unici, dolci semplici) |
| Vocabolario | elenco unico di ingredienti con nomi normalizzati e sinonimi (es. "pomodori", "pomodorini" → "pomodoro") |
| Perché non un'API | le API gratuite trovate (es. TheMealDB) richiedono una chiave a pagamento per le app pubbliche, hanno la ricerca per più ingredienti solo a pagamento e ricette in inglese |
| Evoluzione | l'accesso all'archivio passa da un unico modulo: in una versione futura si può spostare su un database (PostgreSQL come StatefulSet in Kubernetes) senza toccare il resto |

## 6. Requisiti non funzionali

| Requisito | Valore |
|---|---|
| Dispositivi | iPhone (Safari, iOS recenti) e Android (Chrome); schermi da 360 px in su |
| Interfaccia | italiano, pensata per il telefono, pulsanti grandi, uso con una mano |
| Tempo di risposta | riconoscimento accettabile fino a 60-90 secondi su CPU, con attesa sempre visibile; ricerca ricette sotto 1 secondo |
| Dimensione massima immagine | configurabile (es. 5 MB), controllata sia nel telefono sia nel backend |
| Sicurezza | limite di richieste per IP, header di sicurezza, validazione degli input, nessun segreto nel codice |
| Accessibilità | contrasto adeguato, testi alternativi, etichette sui pulsanti |
| Osservabilità | log strutturati JSON su standard output (tempo di analisi, errori), visibili con `kubectl logs` |
| Pronta per i container | configurazione solo da variabili d'ambiente, arresto pulito su SIGTERM, nessun file scritto su disco |

## 7. Architettura

### Componenti

| Componente | Tecnologia | Ruolo |
|---|---|---|
| **Frontend** | React + Vite, PWA (manifest + service worker), servito da **nginx** | interfaccia sul telefono |
| **Backend** | Node.js 22 + Express | riceve la foto, interroga il modello, cerca le ricette, espone `/api` |
| **Archivio ricette** | file JSON incluso nel backend | ricette e vocabolario degli ingredienti |
| **Modello AI** | **Ollama** con un modello di visione open source piccolo, configurabile con una variabile | riconosce gli ingredienti nella foto |
| **Esposizione su internet** | **Cloudflare Tunnel** (`cloudflared`), gratuito | indirizzo https pubblico per i telefoni, senza aprire porte sul router |

### Scelta del modello (RAM: 7,7 GB in WSL)

| Candidato | Note |
|---|---|
| `qwen3-vl:4b` | primo da provare: buon riconoscimento, sta nella RAM disponibile |
| `qwen3-vl:2b` | ripiego se il 4b è troppo lento o pesante |
| modalità `mock` | risposta finta, per sviluppare e testare senza modello |

La scelta finale si fa nel passo 1 del piano, **provando** i modelli su 3-4 foto vere del frigo. Se serve più memoria, si può assegnarne di più a WSL (file `.wslconfig` di Windows).

### Flusso di una richiesta

```
Telefono (iPhone / Android) → https://…trycloudflare.com
   → cloudflared (Pod nel cluster)
   → Ingress → Service frontend (pagina) / Service backend (/api)
   → backend → Service ollama → modello di visione  (solo riconoscimento)
   → backend → archivio ricette                      (ricerca ricette)
   ← ingredienti / ricette in JSON
```

### Kubernetes (locale, sul PC)

- Cluster locale **k3d** dentro WSL: leggero e con Ingress già incluso (Traefik).
- Namespace dedicato `frigochef`.
- **Deployment + Service** per frontend, backend, ollama; **Deployment** per cloudflared.
- **Ingress** per instradare `/` al frontend e `/api` al backend.
- **PersistentVolumeClaim** per i file del modello (così non si riscarica a ogni riavvio).
- **ConfigMap** per la configurazione (modello, timeout, dispensa predefinita, limiti).
- **Probe** di liveness e readiness sugli endpoint di salute; **limiti di CPU e memoria** su ogni container.

### CI/CD e GitOps

- **GitHub Actions**: a ogni push, test di backend e frontend, build delle immagini Docker, pubblicazione su **GHCR** con il tag del commit (e con la versione sui tag di release).
- **Argo CD** nel cluster: legge i manifest da una cartella del repository (**Kustomize**) e allinea il cluster da solo. Il deploy avviene con un commit che cambia la versione dell'immagine: **GitOps**.
- Rollback: si riporta la versione precedente nel manifest (o `git revert`) e Argo CD riallinea il cluster.

## 8. Chi fa cosa

| Parte | Chi |
|---|---|
| Codice dell'app: frontend PWA, backend Express, archivio ricette, dialogo con il modello, test | Sviluppato con il supporto di un assistente AI |
| Dockerfile, pipeline GitHub Actions, manifest Kubernetes, Kustomize, Argo CD, tunnel, probe, limiti, diagnosi | Daniel, con un assistente AI per spiegazioni e revisione |
| Revisione e documentazione del percorso | Daniel |

## 9. Competenze DevOps che il progetto allena

| Area | Cosa impari | Nuovo rispetto a Balloi? |
|---|---|---|
| Docker | build multi-stage, immagini piccole, utente non root | approfondimento |
| Registry | pubblicare immagini su GHCR con tag del commit e di versione | **sì** |
| GitHub Actions | test + build di più immagini, permessi `packages` | approfondimento |
| Kubernetes | Pod, Deployment, Service, Ingress, ConfigMap, PVC, probe, limiti, `kubectl` | **sì** |
| Kustomize | base e overlay, cambio versione dell'immagine | **sì** |
| GitOps | Argo CD, sincronizzazione automatica, rollback con Git | **sì** |
| Rete | tunnel, https, DNS, Ingress | **sì** |
| AI in produzione | servire un modello in container, memoria, timeout | **sì** |

## 10. Struttura del repository

```
frigochef/
├── frontend/          React + Vite (PWA)
├── backend/           Node.js + Express + ricette
├── deploy/            manifest Kubernetes         ← Daniel
│   ├── base/          (Kustomize)
│   └── overlays/local/
├── argocd/            applicazione Argo CD        ← Daniel
├── .github/workflows/ pipeline                    ← Daniel
└── docs/              analisi, ADR, runbook, diario
```

## 11. Fuori dalla prima versione

Account e ricette preferite; filtri (vegetariano, senza glutine, tempo); inglese; valori nutrizionali; lista della spesa; database PostgreSQL; hosting sempre acceso nel cloud; app nativa sugli store.

## 12. Rischi e scelte

| Rischio | Mitigazione |
|---|---|
| RAM insufficiente per il modello | modello piccolo scelto con una prova; limiti di memoria nel cluster; eventuale `.wslconfig` |
| Risposte lente su CPU | immagine ridotta nel telefono, attesa chiara, timeout configurabile |
| Il modello sbaglia ingredienti | vocabolario chiuso + lista modificabile (RF-03): l'AI propone, l'utente decide |
| Nomi degli ingredienti diversi tra foto e ricette | vocabolario unico con sinonimi |
| L'indirizzo del tunnel gratuito cambia a ogni avvio | accettato per la demo; un indirizzo fisso richiederebbe un dominio |
| App disponibile solo con il PC acceso | accettato: i video coprono i momenti in cui non lo è |

## 13. Piano

1. **Verifica dell'ambiente** (Daniel): installare Ollama, provare `qwen3-vl:4b` e `qwen3-vl:2b` su foto vere, scegliere.
2. **App**: backend e frontend funzionanti in locale, con modalità `mock` e con Ollama.
3. **Container e pipeline** (Daniel): Dockerfile, Docker Compose, GitHub Actions, immagini su GHCR.
4. **Kubernetes** (Daniel): cluster k3d, manifest, Ingress, probe, PVC.
5. **GitOps** (Daniel): Argo CD collegato al repository.
6. **Telefoni** (Daniel): Cloudflare Tunnel nel cluster, prova su iPhone e Android.
7. **Documentazione e video**: README, ADR, runbook, episodi per il portfolio.

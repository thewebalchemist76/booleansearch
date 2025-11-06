# 🚀 Guida al Deploy su Cloudflare Pages

## Opzione 1: Deploy tramite Dashboard Cloudflare

1. Vai su [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Seleziona "Pages" nel menu laterale
3. Clicca su "Create a project"
4. Collega il tuo repository GitHub/GitLab
5. Configurazione build:
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Root directory**: `/` (root del progetto)
6. Clicca "Save and Deploy"

## Opzione 2: Deploy tramite Wrangler CLI

1. Installa Wrangler:
```bash
npm install -g wrangler
```

2. Accedi a Cloudflare:
```bash
wrangler login
```

3. Build del progetto:
```bash
npm run build
```

4. Deploy:
```bash
wrangler pages deploy dist
```

## ⚙️ Configurazione Workers Functions

Le Workers Functions sono già configurate automaticamente! Cloudflare Pages riconoscerà automaticamente la cartella `functions/` e creerà gli endpoint API.

L'endpoint sarà disponibile su:
- `https://tuo-progetto.pages.dev/api/search`

## 🔧 Note Importanti

- **Workers Functions**: Le funzioni in `functions/api/search.js` verranno automaticamente esposte come endpoint API
- **CORS**: Se necessario, aggiungi headers CORS nella funzione Worker
- **Rate Limiting**: Google e Bing potrebbero limitare le richieste. L'app include già un delay di 500ms tra le richieste
- **Captcha**: Se Google rileva troppe richieste, l'app prova automaticamente Bing

## 📝 Variabili d'Ambiente (opzionali)

Se in futuro vuoi aggiungere API keys per servizi di ricerca alternativi, puoi configurarle in Cloudflare Pages:

1. Dashboard → Pages → Il tuo progetto → Settings → Environment Variables
2. Aggiungi le variabili necessarie
3. Accedi a esse nel Worker con `context.env.VARIABLE_NAME`


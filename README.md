# 🔍 Search Engine Finder

Un'applicazione web moderna per cercare articoli su più domini simultaneamente utilizzando ricerche booleane su Google e Bing.

## 🚀 Funzionalità

- **Input multipli**: Inserisci più domini e più titoli articoli
- **Pulizia automatica domini**: Rimuove automaticamente http://, https://, www. e path
- **Ricerche booleane**: Cerca automaticamente con `site:dominio articolo` per tutte le combinazioni
- **Multi-motore**: Prova prima Google, poi Bing se Google ha problemi
- **Gestione Captcha**: Rileva e segnala quando viene rilevato un captcha
- **Progress Bar**: Visualizza l'avanzamento delle ricerche in tempo reale
- **Export CSV**: Scarica i risultati in formato CSV con tutti i dettagli

## 📦 Installazione

```bash
npm install
```

## 🛠️ Sviluppo Locale

```bash
npm run dev
```

L'app sarà disponibile su `http://localhost:5173`

## 🚀 Deploy su Cloudflare Pages

1. Installa Wrangler CLI (se non l'hai già):
```bash
npm install -g wrangler
```

2. Accedi a Cloudflare:
```bash
wrangler login
```

3. Build e deploy:
```bash
npm run build
wrangler pages deploy dist
```

Oppure collega il repository GitHub a Cloudflare Pages tramite il dashboard.

## 📝 Come Usare

1. **Inserisci i domini** nel primo campo di testo (uno per riga):
   ```
   youtube.com/
   dailymotion.com/video/
   quotidiano.net/video/
   ```

2. **Inserisci i titoli degli articoli** nel secondo campo (uno per riga):
   ```
   Titolo articolo 1
   Titolo articolo 2
   ```

3. **Clicca "Avvia Ricerca"** - l'app eseguirà tutte le combinazioni:
   - `site:youtube.com Titolo articolo 1`
   - `site:dailymotion.com Titolo articolo 1`
   - `site:youtube.com Titolo articolo 2`
   - etc.

4. **Visualizza i risultati** nella tabella e scarica il CSV quando completato

## 🎨 Design

L'interfaccia è moderna, colorata ma equilibrata, con:
- Gradiente viola/blu per il tema principale
- Design responsive per mobile e desktop
- Progress bar animata
- Tabella risultati con colori per stato (successo/errore/captcha)

## 🔧 Tecnologie

- **Frontend**: React + Vite
- **Backend**: Cloudflare Workers Functions
- **Styling**: CSS puro con gradienti moderni
- **Deploy**: Cloudflare Pages

## 📄 Note

- Le ricerche includono un piccolo delay (500ms) tra le richieste per evitare rate limiting
- Se Google rileva un captcha, l'app prova automaticamente Bing
- I risultati includono link, titoli e stato di ogni ricerca

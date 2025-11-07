import { useState } from 'react'
import './App.css'

function App() {
  const [domains, setDomains] = useState('')
  const [articles, setArticles] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState([])
  const [error, setError] = useState(null)

  const normalizeDomain = (domain) => {
    if (!domain) return ''
    // Remove http://, https://, www.
    let cleaned = domain.trim()
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .replace(/\/$/, '')
      .split('/')[0] // Take only the domain part
    
    return cleaned
  }

  const parseInput = (input) => {
    return input
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
  }

  const handleSearch = async () => {
    if (!domains.trim() || !articles.trim()) {
      setError('Inserisci almeno un dominio e un articolo')
      return
    }

    setIsSearching(true)
    setError(null)
    setResults([])
    setProgress(0)

    const domainList = parseInput(domains).map(normalizeDomain).filter(d => d)
    const articleList = parseInput(articles)

    if (domainList.length === 0 || articleList.length === 0) {
      setError('Inserisci almeno un dominio e un articolo validi')
      setIsSearching(false)
      return
    }

    const totalSearches = domainList.length * articleList.length
    let completed = 0
    const searchResults = []

    try {
      for (const article of articleList) {
        for (const domain of domainList) {
          try {
            const response = await fetch('/api/search', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                domain,
                query: article,
              }),
            })

            const data = await response.json()
            
            // FIX: Rimuovi il .* dalla query
            searchResults.push({
              domain,
              article,
              searchQuery: `site:${domain} "${article}"`, // CORRETTO: tolto .*
              url: data.url || '',
              title: data.title || '',
              error: data.error || null,
              captcha: data.captcha || false,
            })

            completed++
            setProgress(Math.round((completed / totalSearches) * 100))
          } catch (err) {
            searchResults.push({
              domain,
              article,
              searchQuery: `site:${domain} "${article}"`, // CORRETTO: tolto .*
              url: '',
              title: '',
              error: err.message,
              captcha: false,
            })

            completed++
            setProgress(Math.round((completed / totalSearches) * 100))
          }

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 3000)) // Aumentato a 1 secondo
        }
      }

      setResults(searchResults)
    } catch (err) {
      setError(`Errore durante la ricerca: ${err.message}`)
    } finally {
      setIsSearching(false)
    }
  }

  const downloadCSV = () => {
    if (results.length === 0) return

    const headers = ['Dominio', 'Articolo', 'Query di Ricerca', 'Link Articolo', 'Titolo', 'Errore']
    const rows = results.map(r => [
      r.domain,
      r.article,
      r.searchQuery,
      r.url,
      r.title,
      r.error || (r.captcha ? 'Captcha rilevato' : '')
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => {
        const str = String(cell || '')
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`
        }
        return str
      }).join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `ricerche_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
  }

  return (
    <div className="app">
      <div className="container">
        <header className="header">
          <h1>🔍 Search Engine Finder</h1>
          <p className="subtitle">Cerca articoli su più domini simultaneamente</p>
        </header>

        <div className="form-section">
          <div className="input-group">
            <label htmlFor="domains">
              <span className="label-icon">🌐</span>
              Domini (uno per riga)
            </label>
            <textarea
              id="domains"
              value={domains}
              onChange={(e) => setDomains(e.target.value)}
              placeholder="youtube.com&#10;dailymotion.com&#10;quotidiano.net&#10;..."
              rows={8}
              disabled={isSearching}
            />
            <small>I domini verranno puliti automaticamente (rimozione di http://, https://, www.)</small>
          </div>

          <div className="input-group">
            <label htmlFor="articles">
              <span className="label-icon">📰</span>
              Titoli Articoli (uno per riga)
            </label>
            <textarea
              id="articles"
              value={articles}
              onChange={(e) => setArticles(e.target.value)}
              placeholder="Titolo articolo 1&#10;Titolo articolo 2&#10;..."
              rows={8}
              disabled={isSearching}
            />
          </div>

          <button
            className="search-button"
            onClick={handleSearch}
            disabled={isSearching || !domains.trim() || !articles.trim()}
          >
            {isSearching ? '⏳ Ricerca in corso...' : '🚀 Avvia Ricerca'}
          </button>
        </div>

        {error && (
          <div className="error-message">
            ⚠️ {error}
          </div>
        )}

        {isSearching && (
          <div className="progress-section">
            <div className="progress-bar-container">
              <div className="progress-bar" style={{ width: `${progress}%` }}></div>
            </div>
            <p className="progress-text">{progress}% completato</p>
          </div>
        )}

        {results.length > 0 && !isSearching && (
          <div className="results-section">
            <div className="results-header">
              <h2>Risultati ({results.length})</h2>
              <button className="download-button" onClick={downloadCSV}>
                📥 Scarica CSV
              </button>
            </div>

            <div className="results-table-container">
              <table className="results-table">
                <thead>
                  <tr>
                    <th>Dominio</th>
                    <th>Articolo</th>
                    <th>Link</th>
                    <th>Titolo</th>
                    <th>Stato</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((result, idx) => (
                    <tr key={idx} className={result.error || result.captcha ? 'error-row' : result.url ? 'success-row' : ''}>
                      <td>{result.domain}</td>
                      <td>{result.article}</td>
                      <td>
                        {result.url ? (
                          <a href={result.url} target="_blank" rel="noopener noreferrer">
                            {result.url.length > 50 ? result.url.substring(0, 50) + '...' : result.url}
                          </a>
                        ) : (
                          <span className="no-result">-</span>
                        )}
                      </td>
                      <td>{result.title || '-'}</td>
                      <td>
                        {result.captcha && <span className="badge badge-warning">⚠️ Captcha</span>}
                        {result.error && !result.captcha && <span className="badge badge-error">❌ Errore</span>}
                        {result.url && !result.error && <span className="badge badge-success">✅ Trovato</span>}
                        {!result.url && !result.error && !result.captcha && <span className="badge">🔍 Non trovato</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App

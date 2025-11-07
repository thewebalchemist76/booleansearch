export async function onRequestPost(context) {
  const { request } = context;
  
  try {
    let { domain, query } = await request.json();
    
    if (!domain || !query) {
      return new Response(JSON.stringify({ 
        error: 'Dominio e query sono richiesti' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    domain = domain.replace(/\.\*$/, '').replace(/\*$/, '').replace(/\.$/, '').trim();
    const searchQuery = `site:${domain} "${query}"`;
    
    // Use only DuckDuckGo
    const result = await searchDuckDuckGo(searchQuery, query);
    
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

function calculateSimilarity(str1, str2) {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;
  
  const words1 = s1.split(/\s+/);
  const words2 = s2.split(/\s+/);
  let matches = 0;
  
  for (const word1 of words1) {
    for (const word2 of words2) {
      if (word1.length > 3 && word2.length > 3 && word1 === word2) {
        matches++;
      }
    }
  }
  
  return matches / Math.max(words1.length, words2.length);
}

async function searchDuckDuckGo(query, originalQuery) {
  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    
    const response = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://duckduckgo.com/',
      },
      body: `q=${encodeURIComponent(query)}&b=&kl=wt-wt`
    });
    
    if (!response.ok) {
      return {
        url: '',
        title: '',
        error: `Errore DuckDuckGo HTTP ${response.status}`
      };
    }
    
    const html = await response.text();
    const results = [];
    
    // Pattern 1: result__a class
    const resultPattern = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
    let match;
    
    while ((match = resultPattern.exec(html)) !== null) {
      let url = match[1];
      const title = match[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
      
      // Decode DuckDuckGo redirect URLs
      if (url.startsWith('//duckduckgo.com/l/?')) {
        const urlMatch = url.match(/uddg=([^&]+)/);
        if (urlMatch) {
          url = decodeURIComponent(urlMatch[1]);
        }
      }
      
      if (url.startsWith('http') && !url.includes('duckduckgo.com')) {
        const similarity = calculateSimilarity(title, originalQuery);
        results.push({ url, title, similarity });
      }
    }
    
    // Pattern 2: result__url class
    const urlPattern = /<a[^>]+class="[^"]*result__url[^"]*"[^>]+href="([^"]+)"/gi;
    
    while ((match = urlPattern.exec(html)) !== null) {
      let url = match[1];
      
      if (url.startsWith('//duckduckgo.com/l/?')) {
        const urlMatch = url.match(/uddg=([^&]+)/);
        if (urlMatch) {
          url = decodeURIComponent(urlMatch[1]);
        }
      }
      
      if (url.startsWith('http') && !url.includes('duckduckgo.com')) {
        const contextStart = Math.max(0, match.index - 500);
        const contextEnd = Math.min(html.length, match.index + 200);
        const context = html.substring(contextStart, contextEnd);
        
        const titleMatch = context.match(/<a[^>]+class="[^"]*result__a[^"]*"[^>]*>([^<]+)<\/a>/i);
        const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim() : '';
        
        const similarity = title ? calculateSimilarity(title, originalQuery) : 0;
        
        if (!results.some(r => r.url === url)) {
          results.push({ url, title: title || url, similarity });
        }
      }
    }
    
    if (results.length > 0) {
      results.sort((a, b) => b.similarity - a.similarity);
      const best = results[0];
      
      return {
        url: best.url,
        title: best.title,
        error: null
      };
    }
    
    return {
      url: '',
      title: '',
      error: 'Nessun risultato trovato su DuckDuckGo'
    };
  } catch (error) {
    return {
      url: '',
      title: '',
      error: `Errore DuckDuckGo: ${error.message}`
    };
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  
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
    
    // Try Brave first (fast)
    let result = await searchBrave(searchQuery, query, env);
    
    // Try DuckDuckGo if Brave fails
    if (!result.url || result.error) {
      result = await searchDuckDuckGo(searchQuery, query);
    }
    
    // Try Google as last resort (slow and may fail with captcha)
    if (!result.url || result.error) {
      result = await searchGoogle(searchQuery, query);
    }
    
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

function getRandomUserAgent() {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  ];
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

async function searchBrave(query, originalQuery, env) {
  try {
    if (!env.BRAVE_API_KEY) {
      return { url: '', title: '', error: 'BRAVE_API_KEY non configurata' };
    }
    
    const apiUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`;
    
    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': env.BRAVE_API_KEY
      }
    });
    
    if (!response.ok) {
      return { url: '', title: '', error: `Errore Brave API HTTP ${response.status}` };
    }
    
    const data = await response.json();
    
    if (!data.web || !data.web.results || data.web.results.length === 0) {
      return { url: '', title: '', error: 'Nessun risultato trovato su Brave' };
    }
    
    const results = [];
    
    for (const result of data.web.results) {
      const url = result.url;
      const title = result.title || '';
      const description = result.description || '';
      
      const titleSimilarity = calculateSimilarity(title, originalQuery);
      const descSimilarity = calculateSimilarity(description, originalQuery);
      const similarity = Math.max(titleSimilarity, descSimilarity * 0.8);
      
      results.push({ url, title, description, similarity });
    }
    
    if (results.length > 0) {
      results.sort((a, b) => b.similarity - a.similarity);
      return { url: results[0].url, title: results[0].title, error: null };
    }
    
    return { url: '', title: '', error: 'Nessun risultato trovato su Brave' };
  } catch (error) {
    return { url: '', title: '', error: `Errore Brave: ${error.message}` };
  }
}

async function searchDuckDuckGo(query, originalQuery) {
  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    
    const response = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://duckduckgo.com/',
      },
      body: `q=${encodeURIComponent(query)}&b=&kl=wt-wt`
    });
    
    if (!response.ok) {
      return { url: '', title: '', error: `Errore DuckDuckGo HTTP ${response.status}` };
    }
    
    const html = await response.text();
    const results = [];
    
    const resultPattern = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
    let match;
    
    while ((match = resultPattern.exec(html)) !== null) {
      let url = match[1];
      const title = match[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
      
      if (url.startsWith('//duckduckgo.com/l/?')) {
        const urlMatch = url.match(/uddg=([^&]+)/);
        if (urlMatch) url = decodeURIComponent(urlMatch[1]);
      }
      
      if (url.startsWith('http') && !url.includes('duckduckgo.com')) {
        const similarity = calculateSimilarity(title, originalQuery);
        results.push({ url, title, similarity });
      }
    }
    
    if (results.length > 0) {
      results.sort((a, b) => b.similarity - a.similarity);
      return { url: results[0].url, title: results[0].title, error: null };
    }
    
    return { url: '', title: '', error: 'Nessun risultato trovato su DuckDuckGo' };
  } catch (error) {
    return { url: '', title: '', error: `Errore DuckDuckGo: ${error.message}` };
  }
}

async function searchGoogle(query, originalQuery) {
  try {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=10&hl=it`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
      },
    });
    
    if (!response.ok) {
      return { url: '', title: '', captcha: response.status === 429, error: `Errore HTTP ${response.status}` };
    }
    
    const html = await response.text();
    
    // Check for captcha
    if (/captcha|CAPTCHA|unusual traffic|verify you're not a robot/i.test(html)) {
      return { captcha: true, error: 'Captcha rilevato su Google', url: '', title: '' };
    }
    
    const results = [];
    
    // Extract results
    const linkRegex = /<a[^>]+href="\/url\?q=([^"&]+)[^"]*"/gi;
    let match;
    
    while ((match = linkRegex.exec(html)) !== null && results.length < 10) {
      const url = decodeURIComponent(match[1]);
      
      if (url && !url.includes('google.com') && !url.includes('webcache.googleusercontent.com')) {
        const contextStart = Math.max(0, match.index - 200);
        const contextEnd = Math.min(html.length, match.index + 500);
        const context = html.substring(contextStart, contextEnd);
        const titleMatch = context.match(/<h3[^>]*>([^<]+)<\/h3>/i);
        const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
        
        const similarity = title ? calculateSimilarity(title, originalQuery) : 0;
        
        if (!results.some(r => r.url === url)) {
          results.push({ url, title: title || url, similarity });
        }
      }
    }
    
    if (results.length > 0) {
      results.sort((a, b) => b.similarity - a.similarity);
      return { url: results[0].url, title: results[0].title, captcha: false, error: null };
    }
    
    return { url: '', title: '', captcha: false, error: 'Nessun risultato trovato su Google' };
  } catch (error) {
    return { url: '', title: '', captcha: false, error: `Errore Google: ${error.message}` };
  }
}

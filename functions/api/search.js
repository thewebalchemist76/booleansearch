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
    
    // FIX: Pulisci il dominio
    domain = domain.replace(/\.\*$/, '')
                   .replace(/\*$/, '')
                   .replace(/\.$/, '')
                   .trim();
    
    const searchQuery = `site:${domain} "${query}"`;
    
    // Try DuckDuckGo first
    let result = await searchDuckDuckGo(searchQuery, query);
    
    // If DuckDuckGo fails, try Google
    if (!result.url || result.error) {
      const googleResult = await searchGoogle(searchQuery, query);
      if (googleResult.url && !googleResult.error && !googleResult.captcha) {
        result = googleResult;
      }
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

// Helper function to calculate string similarity
function calculateSimilarity(str1, str2) {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  // Exact match
  if (s1 === s2) return 1.0;
  
  // Check if one contains the other
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;
  
  // Count matching words
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
    // Use the HTML-only endpoint for easier parsing
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
        error: `Errore HTTP ${response.status}`
      };
    }
    
    const html = await response.text();
    
    // DuckDuckGo HTML version has simpler structure
    const results = [];
    
    // Pattern for HTML version: <a class="result__a" href="URL">TITLE</a>
    const resultPattern = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
    let match;
    
    while ((match = resultPattern.exec(html)) !== null) {
      let url = match[1];
      const title = match[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
      
      // DuckDuckGo HTML wraps URLs, need to decode
      if (url.startsWith('//duckduckgo.com/l/?')) {
        // Extract the actual URL from redirect
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
    
    // Alternative pattern: <a rel="nofollow" class="result__url" href="URL">
    const urlPattern = /<a[^>]+rel="nofollow"[^>]*class="[^"]*result__url[^"]*"[^>]+href="([^"]+)"/gi;
    
    while ((match = urlPattern.exec(html)) !== null) {
      let url = match[1];
      
      // Decode DuckDuckGo redirect
      if (url.startsWith('//duckduckgo.com/l/?')) {
        const urlMatch = url.match(/uddg=([^&]+)/);
        if (urlMatch) {
          url = decodeURIComponent(urlMatch[1]);
        }
      }
      
      if (url.startsWith('http') && !url.includes('duckduckgo.com')) {
        // Try to find the title for this URL
        const contextStart = Math.max(0, match.index - 500);
        const contextEnd = Math.min(html.length, match.index + 200);
        const context = html.substring(contextStart, contextEnd);
        
        const titleMatch = context.match(/<a[^>]+class="[^"]*result__a[^"]*"[^>]*>([^<]+)<\/a>/i);
        const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim() : '';
        
        const similarity = title ? calculateSimilarity(title, originalQuery) : 0;
        
        // Avoid duplicates
        if (!results.some(r => r.url === url)) {
          results.push({ url, title: title || url, similarity });
        }
      }
    }
    
    // Sort by similarity and return the best match
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

async function searchGoogle(query, originalQuery) {
  try {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=10&hl=it`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': 'https://www.google.com/',
      },
    });
    
    if (!response.ok) {
      return {
        url: '',
        title: '',
        captcha: response.status === 429,
        error: `Errore HTTP ${response.status}`
      };
    }
    
    const html = await response.text();
    
    const captchaPatterns = [
      /captcha/i,
      /CAPTCHA/,
      /unusual traffic/i,
      /Our systems have detected/i,
      /automated requests/i,
      /verify you're not a robot/i,
      /g-recaptcha/i,
      /recaptcha/i
    ];
    
    const hasCaptcha = captchaPatterns.some(pattern => pattern.test(html));
    
    if (hasCaptcha) {
      return {
        captcha: true,
        error: 'Captcha rilevato su Google',
        url: '',
        title: ''
      };
    }
    
    // Extract results with titles
    const results = [];
    
    const urlMatch1 = html.match(/<a[^>]+href="\/url\?q=([^"&]+)[^"]*"[^>]*>[\s\S]*?<h3[^>]*>([^<]+)<\/h3>/i);
    if (urlMatch1 && urlMatch1[1]) {
      const url = decodeURIComponent(urlMatch1[1]);
      const title = urlMatch1[2] ? urlMatch1[2].replace(/<[^>]+>/g, '').trim() : '';
      
      if (url && !url.startsWith('http://www.google.com') && !url.startsWith('https://www.google.com')) {
        const similarity = calculateSimilarity(title, originalQuery);
        results.push({ url, title, similarity, captcha: false, error: null });
      }
    }
    
    const linkRegex = /<a[^>]+href="\/url\?q=([^"&]+)[^"]*"/gi;
    let match;
    
    while ((match = linkRegex.exec(html)) !== null && results.length < 5) {
      const url = decodeURIComponent(match[1]);
      
      if (url && !url.startsWith('http://www.google.com') && 
          !url.startsWith('https://www.google.com') &&
          !url.startsWith('http://webcache.googleusercontent.com') &&
          !url.includes('google.com/search')) {
        
        // Try to find title
        const contextStart = Math.max(0, match.index - 200);
        const contextEnd = Math.min(html.length, match.index + 500);
        const context = html.substring(contextStart, contextEnd);
        const titleMatch = context.match(/<h3[^>]*>([^<]+)<\/h3>/i);
        const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
        
        const similarity = title ? calculateSimilarity(title, originalQuery) : 0;
        
        if (!results.some(r => r.url === url)) {
          results.push({ url, title: title || url, similarity, captcha: false, error: null });
        }
      }
    }
    
    if (results.length > 0) {
      results.sort((a, b) => b.similarity - a.similarity);
      return results[0];
    }
    
    return {
      url: '',
      title: '',
      captcha: false,
      error: 'Nessun risultato trovato su Google'
    };
  } catch (error) {
    return {
      url: '',
      title: '',
      captcha: false,
      error: `Errore Google: ${error.message}`
    };
  }
}

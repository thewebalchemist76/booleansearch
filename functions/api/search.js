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
    
    // Use only Qwant
    const result = await searchQwant(searchQuery, query);
    
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

async function searchQwant(query, originalQuery) {
  try {
    // Qwant search URL
    const searchUrl = `https://www.qwant.com/?q=${encodeURIComponent(query)}&t=web`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': 'https://www.qwant.com/',
      }
    });
    
    if (!response.ok) {
      return {
        url: '',
        title: '',
        error: `Errore Qwant HTTP ${response.status}`
      };
    }
    
    const html = await response.text();
    
    // Parse Qwant results based on the HTML structure you provided
    const results = [];
    
    // Pattern 1: Main title link with class pattern
    // Looking for: <a href="URL" class="external"><div class="..."><span>TITLE</span></div></a>
    const titlePattern = /<a\s+href="(https?:\/\/[^"]+)"\s+class="external"[^>]*>\s*<div[^>]*class="[^"]*HhS7p[^"]*"[^>]*>\s*<span>([^<]+)<\/span>/gi;
    let match;
    
    while ((match = titlePattern.exec(html)) !== null) {
      const url = match[1];
      const title = match[2].trim();
      
      // Skip Qwant internal links
      if (!url.includes('qwant.com')) {
        const similarity = calculateSimilarity(title, originalQuery);
        results.push({ url, title, similarity });
      }
    }
    
    // Pattern 2: Alternative - look for data-testid="webResult" containers
    const webResultPattern = /<div[^>]+data-testid="webResult"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/gi;
    
    while ((match = webResultPattern.exec(html)) !== null && results.length < 10) {
      const resultBlock = match[1];
      
      // Extract URL from the block
      const urlMatch = resultBlock.match(/href="(https?:\/\/[^"]+)"\s+class="external"/);
      if (urlMatch) {
        const url = urlMatch[1];
        
        // Extract title
        const titleMatch = resultBlock.match(/<span>([^<]+)<\/span>\s*<\/div>\s*<\/a>\s*<div[^>]*class="[^"]*ikbiq/);
        const title = titleMatch ? titleMatch[1].trim() : '';
        
        if (url && !url.includes('qwant.com') && !results.some(r => r.url === url)) {
          const similarity = title ? calculateSimilarity(title, originalQuery) : 0;
          results.push({ url, title: title || url, similarity });
        }
      }
    }
    
    // Pattern 3: Simpler extraction - just get all external links
    if (results.length === 0) {
      const linkPattern = /<a\s+href="(https?:\/\/(?!www\.qwant\.com)[^"]+)"\s+class="external"/gi;
      
      while ((match = linkPattern.exec(html)) !== null && results.length < 10) {
        const url = match[1];
        
        // Try to find title near this link
        const contextStart = Math.max(0, match.index - 500);
        const contextEnd = Math.min(html.length, match.index + 1000);
        const context = html.substring(contextStart, contextEnd);
        
        const titleMatch = context.match(/<span>([^<]+)<\/span>\s*<\/div>\s*<\/a>/);
        const title = titleMatch ? titleMatch[1].trim() : '';
        
        if (!results.some(r => r.url === url)) {
          const similarity = title ? calculateSimilarity(title, originalQuery) : 0;
          results.push({ url, title: title || url, similarity });
        }
      }
    }
    
    // Sort by similarity and return best match
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
      error: 'Nessun risultato trovato su Qwant'
    };
  } catch (error) {
    return {
      url: '',
      title: '',
      error: `Errore Qwant: ${error.message}`
    };
  }
}

/* COMMENTED OUT - Other search engines

async function searchDuckDuckGo(query, originalQuery) {
  // ... DuckDuckGo code commented
}

async function searchBrave(query, originalQuery, env) {
  // ... Brave code commented
}

async function searchSerpAPI(query, originalQuery, env) {
  // ... SerpAPI code commented
}

async function searchScraperAPI(query, originalQuery, env) {
  // ... ScraperAPI code commented
}

*/

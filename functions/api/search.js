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
    
    // Try ScraperAPI first (1000 credits/month)
    let result = await searchScraperAPI(searchQuery, query, env);
    let usedScraperAPI = false;
    
    if (result.url && !result.error) {
      usedScraperAPI = true;
    } else {
      // Fallback to Brave (2000 credits/month)
      result = await searchBrave(searchQuery, query, env);
    }
    
    return new Response(JSON.stringify({
      ...result,
      usedScraperAPI
    }), {
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

async function searchScraperAPI(query, originalQuery, env) {
  try {
    if (!env.SCRAPER_API_KEY) {
      return {
        url: '',
        title: '',
        error: 'SCRAPER_API_KEY non configurata'
      };
    }
    
    // Google search URL
    const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=10&hl=it&gl=it`;
    
    // ScraperAPI endpoint with better parameters
    const scraperUrl = `http://api.scraperapi.com/?api_key=${env.SCRAPER_API_KEY}&url=${encodeURIComponent(googleUrl)}&country_code=it&render=false&premium=false`;
    
    const response = await fetch(scraperUrl, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    
    if (!response.ok) {
      return {
        url: '',
        title: '',
        error: `Errore ScraperAPI HTTP ${response.status}`
      };
    }
    
    const html = await response.text();
    
    // Check for captcha or errors in the response
    if (/captcha|CAPTCHA|unusual traffic/i.test(html)) {
      return {
        url: '',
        title: '',
        error: 'Captcha rilevato tramite ScraperAPI'
      };
    }
    
    // Parse Google results from HTML
    const results = [];
    
    // Extract links from Google search results
    const linkRegex = /<a[^>]+href="\/url\?q=([^"&]+)[^"]*"/gi;
    let match;
    
    while ((match = linkRegex.exec(html)) !== null && results.length < 10) {
      const url = decodeURIComponent(match[1]);
      
      if (url && !url.includes('google.com') && !url.includes('webcache.googleusercontent.com')) {
        // Try to find title near the link
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
      return {
        url: results[0].url,
        title: results[0].title,
        error: null
      };
    }
    
    return {
      url: '',
      title: '',
      error: 'Nessun risultato trovato tramite ScraperAPI'
    };
  } catch (error) {
    return {
      url: '',
      title: '',
      error: `Errore ScraperAPI: ${error.message}`
    };
  }
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

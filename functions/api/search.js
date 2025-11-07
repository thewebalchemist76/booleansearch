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
    
    // Pulisci il dominio
    domain = domain.replace(/\.\*$/, '').replace(/\*$/, '').replace(/\.$/, '').trim();
    
    const searchQuery = `site:${domain} "${query}"`;
    
    // Use Google with ScraperAPI
    const result = await searchGoogle(searchQuery, query, env);
    
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

async function searchGoogle(query, originalQuery, env) {
  try {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=10&hl=it`;
    
    let response;
    
    // Use ScraperAPI if available
    if (env.SCRAPER_API_KEY) {
      const scraperUrl = `http://api.scraperapi.com?api_key=${env.SCRAPER_API_KEY}&url=${encodeURIComponent(searchUrl)}&render=false`;
      response = await fetch(scraperUrl);
    } else {
      // Fallback to direct request (will likely get rate limited)
      response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
        },
      });
    }
    
    if (!response.ok) {
      return {
        url: '',
        title: '',
        captcha: response.status === 429,
        error: `Errore HTTP ${response.status}. ${env.SCRAPER_API_KEY ? '' : 'Configura SCRAPER_API_KEY per evitare rate limiting.'}`
      };
    }
    
    const html = await response.text();
    
    // Check for captcha
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
    
    // Extract results
    const results = [];
    
    // Strategy 1
    const urlMatch1 = html.match(/<a[^>]+href="\/url\?q=([^"&]+)[^"]*"[^>]*>[\s\S]*?<h3[^>]*>([^<]+)<\/h3>/i);
    if (urlMatch1 && urlMatch1[1]) {
      const url = decodeURIComponent(urlMatch1[1]);
      const title = urlMatch1[2] ? urlMatch1[2].replace(/<[^>]+>/g, '').trim() : '';
      
      if (url && !url.includes('google.com')) {
        const similarity = calculateSimilarity(title, originalQuery);
        results.push({ url, title, similarity, captcha: false, error: null });
      }
    }
    
    // Strategy 2
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

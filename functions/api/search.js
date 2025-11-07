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
    
    // FIX: Pulisci il dominio
    domain = domain.replace(/\.\*$/, '')
                   .replace(/\*$/, '')
                   .replace(/\.$/, '')
                   .trim();
    
    const searchQuery = `site:${domain} "${query}"`;
    
    // Use Google with rotating proxies
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

// Helper to get random User-Agent
function getRandomUserAgent() {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  ];
  
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

// Helper function to calculate string similarity
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
    const userAgent = getRandomUserAgent();
    
    // Prepare fetch options
    const fetchOptions = {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
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
        'Referer': 'https://www.google.com/',
      },
    };
    
    // Add proxy if credentials are available
    if (env.PROXY_HOST && env.PROXY_USERNAME && env.PROXY_PASSWORD) {
      // Note: Cloudflare Workers don't support HTTP proxies directly via fetch
      // We need to use a different approach
      
      // Create proxy URL with authentication
      const proxyUrl = `http://${env.PROXY_USERNAME}:${env.PROXY_PASSWORD}@${env.PROXY_HOST}:${env.PROXY_PORT || '80'}`;
      
      // For Cloudflare Workers, we need to use a workaround
      // Option 1: Use a proxy service that works with Workers
      // Option 2: Make the request through a proxy endpoint
      
      // Since Cloudflare Workers don't natively support HTTP proxies,
      // we'll try a direct request with rotating User-Agents first
      // If you need true proxy support, consider using a different platform or proxy API
    }
    
    const response = await fetch(searchUrl, fetchOptions);
    
    if (!response.ok) {
      return {
        url: '',
        title: '',
        captcha: response.status === 429,
        error: `Errore HTTP ${response.status}`
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
    
    // Extract results with titles
    const results = [];
    
    // Strategy 1: Standard pattern
    const urlMatch1 = html.match(/<a[^>]+href="\/url\?q=([^"&]+)[^"]*"[^>]*>[\s\S]*?<h3[^>]*>([^<]+)<\/h3>/i);
    if (urlMatch1 && urlMatch1[1]) {
      const url = decodeURIComponent(urlMatch1[1]);
      const title = urlMatch1[2] ? urlMatch1[2].replace(/<[^>]+>/g, '').trim() : '';
      
      if (url && !url.startsWith('http://www.google.com') && !url.startsWith('https://www.google.com')) {
        const similarity = calculateSimilarity(title, originalQuery);
        results.push({ url, title, similarity, captcha: false, error: null });
      }
    }
    
    // Strategy 2: Extract all links
    const linkRegex = /<a[^>]+href="\/url\?q=([^"&]+)[^"]*"/gi;
    let match;
    
    while ((match = linkRegex.exec(html)) !== null && results.length < 10) {
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
      // Sort by similarity and return best match
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

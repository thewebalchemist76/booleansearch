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
    
    // FIX: Pulisci il dominio da qualsiasi carattere strano
    domain = domain.replace(/\.\*$/, '')
                   .replace(/\*$/, '')
                   .replace(/\.$/, '')
                   .trim();
    
    const searchQuery = `site:${domain} "${query}"`;
    
    // Try DuckDuckGo first (no captcha)
    let result = await searchDuckDuckGo(searchQuery);
    
    // If DuckDuckGo fails, try Google
    if (!result.url || result.error) {
      const googleResult = await searchGoogle(searchQuery);
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

async function searchDuckDuckGo(query) {
  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': 'https://duckduckgo.com/',
      },
    });
    
    if (!response.ok) {
      return {
        url: '',
        title: '',
        error: `Errore HTTP ${response.status}`
      };
    }
    
    const html = await response.text();
    
    // Parse DuckDuckGo results based on the HTML structure
    // Strategy 1: Find result-title-a link (most reliable)
    const titleLinkPattern = /<a[^>]+href="([^"]+)"[^>]*data-testid="result-title-a"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/i;
    const titleMatch = html.match(titleLinkPattern);
    
    if (titleMatch && titleMatch[1]) {
      const url = titleMatch[1];
      const title = titleMatch[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
      
      // Skip DuckDuckGo internal links
      if (url.startsWith('http') && !url.includes('duckduckgo.com')) {
        return {
          url: url,
          title: title || url,
          error: null
        };
      }
    }
    
    // Strategy 2: Find result-extras-url-link
    const urlLinkPattern = /<a[^>]+href="([^"]+)"[^>]*data-testid="result-extras-url-link"/i;
    const urlMatch = html.match(urlLinkPattern);
    
    if (urlMatch && urlMatch[1]) {
      const url = urlMatch[1];
      
      if (url.startsWith('http') && !url.includes('duckduckgo.com')) {
        // Try to find title
        let title = '';
        const titlePattern = /<h2[^>]*>[\s\S]*?<a[^>]+href="[^"]*"[^>]*data-testid="result-title-a"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/i;
        const titleMatch2 = html.match(titlePattern);
        if (titleMatch2) {
          title = titleMatch2[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
        }
        
        return {
          url: url,
          title: title || url,
          error: null
        };
      }
    }
    
    // Strategy 3: Find all result links
    const linkRegex = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*data-testid="result-title-a"/gi;
    const links = [];
    let match;
    
    while ((match = linkRegex.exec(html)) !== null && links.length < 5) {
      const url = match[1];
      if (!url.includes('duckduckgo.com')) {
        links.push(url);
      }
    }
    
    if (links.length > 0) {
      return {
        url: links[0],
        title: links[0],
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

async function searchGoogle(query) {
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
    
    // Multiple parsing strategies for Google results
    // Strategy 1: Standard result link pattern
    const urlMatch1 = html.match(/<a[^>]+href="\/url\?q=([^"&]+)[^"]*"[^>]*>[\s\S]*?<h3[^>]*>([^<]+)<\/h3>/i);
    if (urlMatch1 && urlMatch1[1]) {
      const url = decodeURIComponent(urlMatch1[1]);
      const title = urlMatch1[2] ? urlMatch1[2].replace(/<[^>]+>/g, '').trim() : '';
      
      if (url && !url.startsWith('http://www.google.com') && !url.startsWith('https://www.google.com')) {
        return {
          url: url,
          title: title,
          captcha: false,
          error: null
        };
      }
    }
    
    // Strategy 2: Extract all result links
    const linkRegex = /<a[^>]+href="\/url\?q=([^"&]+)[^"]*"/gi;
    const links = [];
    let match;
    while ((match = linkRegex.exec(html)) !== null && links.length < 5) {
      const url = decodeURIComponent(match[1]);
      if (url && !url.startsWith('http://www.google.com') && 
          !url.startsWith('https://www.google.com') &&
          !url.startsWith('http://webcache.googleusercontent.com') &&
          !url.includes('google.com/search')) {
        links.push(url);
      }
    }
    
    if (links.length > 0) {
      const firstUrl = links[0];
      let title = '';
      
      const linkIndex = html.indexOf(`/url?q=${encodeURIComponent(firstUrl)}`);
      if (linkIndex > -1) {
        const context = html.substring(Math.max(0, linkIndex - 500), linkIndex + 1000);
        const titleMatch = context.match(/<h3[^>]*>([^<]+)<\/h3>/i);
        if (titleMatch) {
          title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
        }
      }
      
      return {
        url: firstUrl,
        title: title || firstUrl,
        captcha: false,
        error: null
      };
    }
    
    // Strategy 3: Try to find any external link
    const externalLinkRegex = /href="(https?:\/\/[^"]+)"[^>]*class="[^"]*yuRUbf[^"]*"/i;
    const externalMatch = html.match(externalLinkRegex);
    if (externalMatch && externalMatch[1]) {
      return {
        url: externalMatch[1],
        title: externalMatch[1],
        captcha: false,
        error: null
      };
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

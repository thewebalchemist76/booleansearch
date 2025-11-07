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
    
    // Try multiple search engines in sequence
    let result = await searchDuckDuckGo(searchQuery);
    
    if (!result.url || result.error) {
      result = await searchBrave(searchQuery);
    }
    
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
    // Try regular DuckDuckGo endpoint first
    const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&t=h_&ia=web`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
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
    
    // Multiple strategies for parsing DuckDuckGo
    
    // Strategy 1: Look for data-testid="result-title-a"
    const patterns = [
      // Pattern from your HTML
      /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*data-testid="result-title-a"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/i,
      // Alternative pattern
      /<a[^>]+data-testid="result-title-a"[^>]*href="(https?:\/\/[^"]+)"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/i,
      // Simpler pattern
      /data-testid="result-title-a"[^>]*href="(https?:\/\/[^"]+)"/i,
    ];
    
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        const url = match[1];
        const title = match[2] ? match[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim() : '';
        
        if (url.startsWith('http') && !url.includes('duckduckgo.com')) {
          return {
            url: url,
            title: title || url,
            error: null
          };
        }
      }
    }
    
    // Strategy 2: Look for result-extras-url-link
    const urlLinkPattern = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*data-testid="result-extras-url-link"/i;
    const urlMatch = html.match(urlLinkPattern);
    
    if (urlMatch && urlMatch[1]) {
      const url = urlMatch[1];
      if (url.startsWith('http') && !url.includes('duckduckgo.com')) {
        return {
          url: url,
          title: url,
          error: null
        };
      }
    }
    
    // Strategy 3: Generic link search
    const linkRegex = /<a[^>]+href="(https?:\/\/(?!duckduckgo\.com)[^"]+)"/gi;
    let match;
    const links = [];
    
    while ((match = linkRegex.exec(html)) !== null && links.length < 10) {
      const url = match[1];
      // Filter out common non-result links
      if (!url.includes('duckduckgo.com') && 
          !url.includes('mailto:') &&
          !url.includes('javascript:') &&
          !url.includes('.ico') &&
          !url.includes('/favicon')) {
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

async function searchBrave(query) {
  try {
    const searchUrl = `https://search.brave.com/search?q=${encodeURIComponent(query)}&source=web`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
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
    
    // Parse Brave results
    // Brave uses different patterns
    const patterns = [
      // Standard Brave result
      /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*class="[^"]*result-header[^"]*"/i,
      // Alternative pattern
      /<div[^>]*class="[^"]*snippet[^"]*"[^>]*>[\s\S]*?<a[^>]+href="(https?:\/\/[^"]+)"/i,
    ];
    
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        const url = match[1];
        if (url.startsWith('http') && !url.includes('brave.com/search')) {
          return {
            url: url,
            title: url,
            error: null
          };
        }
      }
    }
    
    // Generic search for external links
    const linkRegex = /<a[^>]+href="(https?:\/\/(?!search\.brave\.com)[^"]+)"/gi;
    let match;
    const links = [];
    
    while ((match = linkRegex.exec(html)) !== null && links.length < 10) {
      const url = match[1];
      if (!url.includes('brave.com') && 
          !url.includes('mailto:') &&
          !url.includes('.ico')) {
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
      error: 'Nessun risultato trovato su Brave'
    };
  } catch (error) {
    return {
      url: '',
      title: '',
      error: `Errore Brave: ${error.message}`
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
      return {
        url: links[0],
        title: links[0],
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

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
    
    // Use Brave Search API
    const result = await searchBrave(searchQuery, query, env);
    
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

async function searchBrave(query, originalQuery, env) {
  try {
    if (!env.BRAVE_API_KEY) {
      return {
        url: '',
        title: '',
        error: 'BRAVE_API_KEY non configurata. Aggiungi la chiave API nelle impostazioni di Cloudflare.'
      };
    }
    
    // Brave Search API endpoint
    const apiUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`;
    
    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': env.BRAVE_API_KEY
      }
    });
    
    if (!response.ok) {
      return {
        url: '',
        title: '',
        error: `Errore Brave API HTTP ${response.status}`
      };
    }
    
    const data = await response.json();
    
    // Parse Brave API response
    if (!data.web || !data.web.results || data.web.results.length === 0) {
      return {
        url: '',
        title: '',
        error: 'Nessun risultato trovato su Brave'
      };
    }
    
    // Extract all results with similarity scores
    const results = [];
    
    for (const result of data.web.results) {
      const url = result.url;
      const title = result.title || '';
      const description = result.description || '';
      
      // Calculate similarity based on title and description
      const titleSimilarity = calculateSimilarity(title, originalQuery);
      const descSimilarity = calculateSimilarity(description, originalQuery);
      const similarity = Math.max(titleSimilarity, descSimilarity * 0.8);
      
      results.push({
        url,
        title,
        description,
        similarity
      });
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

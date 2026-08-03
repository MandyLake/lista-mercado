exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const OPENROUTER_KEY = process.env.OPENROUTER_KEY;
  
  // Debug: log what env vars are available (sem expor valores)
  const envKeys = Object.keys(process.env).filter(k => !k.includes('SECRET') && !k.includes('TOKEN') && !k.includes('KEY'));
  console.log('Available env keys (non-sensitive):', envKeys);
  console.log('OPENROUTER_KEY present:', !!OPENROUTER_KEY);
  console.log('OPENROUTER_KEY length:', OPENROUTER_KEY ? OPENROUTER_KEY.length : 0);

  if (!OPENROUTER_KEY) {
    return { 
      statusCode: 500, 
      body: JSON.stringify({ 
        error: 'API key not configured on server',
        debug: { keyPresent: false, envCount: Object.keys(process.env).length }
      }) 
    };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch(e) { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { prompt } = body;
  if (!prompt) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing prompt' }) };
  }

  const FREE_MODELS = [
    'nvidia/llama-3.1-nemotron-nano-8b-v1:free',
    'google/gemma-3-27b-it:free',
    'google/gemma-3-12b-it:free',
    'mistralai/mistral-7b-instruct:free',
    'qwen/qwen3-8b:free',
    'meta-llama/llama-3.2-3b-instruct:free',
    'openchat/openchat-7b:free',
  ];

  let lastError = '';
  let lastStatus = 0;

  for (const model of FREE_MODELS) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENROUTER_KEY}`,
          'HTTP-Referer': 'https://iridescent-sundae-ac775b.netlify.app',
          'X-Title': 'Lista Mercado SP'
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 2000,
          temperature: 0.1
        })
      });

      const data = await response.json();
      lastStatus = response.status;

      if (!response.ok) {
        lastError = data.error?.message || JSON.stringify(data.error) || `HTTP ${response.status}`;
        console.log(`Model ${model} failed:`, lastError);
        // Skip to next model if unavailable/quota
        if (lastError.includes('unavailable') || lastError.includes('free') || 
            response.status === 402 || response.status === 429) {
          continue;
        }
        // Auth error — return immediately, no point trying other models
        if (response.status === 401 || lastError.includes('Authentication') || lastError.includes('auth')) {
          return { statusCode: 401, body: JSON.stringify({ error: `Auth error: ${lastError}`, keyLength: OPENROUTER_KEY.length }) };
        }
        continue;
      }

      const text = data.choices?.[0]?.message?.content || '';
      if (!text) { lastError = 'empty response'; continue; }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, model_used: model })
      };

    } catch(e) {
      lastError = e.message;
      console.log(`Model ${model} exception:`, e.message);
      continue;
    }
  }

  return {
    statusCode: 503,
    body: JSON.stringify({ error: `Todos os modelos falharam. Último: ${lastError} (HTTP ${lastStatus})` })
  };
};

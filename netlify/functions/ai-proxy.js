exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const OPENROUTER_KEY = process.env.OPENROUTER_KEY;
  if (!OPENROUTER_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured on server' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch(e) { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { prompt } = body;
  if (!prompt) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing prompt' }) };
  }

  // Lista de modelos gratuitos para tentar em sequência
  const FREE_MODELS = [
    'nvidia/llama-3.1-nemotron-nano-8b-v1:free',
    'google/gemma-3-27b-it:free',
    'google/gemma-3-12b-it:free',
    'mistralai/mistral-7b-instruct:free',
    'qwen/qwen3-8b:free',
    'nousresearch/hermes-3-llama-3.1-405b:free',
    'openchat/openchat-7b:free',
    'gryphe/mythomax-l2-13b:free',
  ];

  let lastError = '';

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

      // Se modelo não disponível, tenta próximo
      if (!response.ok) {
        lastError = data.error?.message || `HTTP ${response.status}`;
        if (response.status === 402 || response.status === 400 ||
            (lastError && lastError.includes('unavailable for free'))) {
          continue; // tenta próximo modelo
        }
        return { statusCode: response.status, body: JSON.stringify({ error: lastError }) };
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
      continue;
    }
  }

  return {
    statusCode: 503,
    body: JSON.stringify({ error: `Todos os modelos gratuitos falharam. Último erro: ${lastError}` })
  };
};

// v2 - force redeploy to pick up env vars

export function authMiddleware(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({ error: 'Missing X-API-Key header' });
  }

  // Parse API keys from env
  const keysEnv = process.env.RESEARCH_TOOL_API_KEYS || '';
  const keyMap = {};
  keysEnv.split(',').forEach(pair => {
    const [name, key] = pair.split(':').map(s => s.trim());
    if (name && key) keyMap[key] = name;
  });

  const keyName = keyMap[apiKey];
  if (!keyName) {
    return res.status(403).json({ error: 'Invalid API key' });
  }

  // Attach to request
  req.apiKey = apiKey;
  req.apiKeyName = keyName;
  next();
}

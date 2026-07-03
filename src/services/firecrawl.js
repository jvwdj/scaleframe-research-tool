export async function scrapeURL(url) {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error('FIRECRAWL_API_KEY not set');

  try {
    const response = await fetch('https://api.firecrawl.dev/v2/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: url,
        pageOptions: {
          onlyMainContent: true,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Firecrawl error: ${error.error || response.statusText}`);
    }

    const data = await response.json();
    return {
      success: true,
      markdown: data.markdown || data.content || '',
      url: data.url,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
    };
  }
}

export async function extractVariables(markdown, variables, rowData) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set');

  // Build the prompt with variable descriptions (interpolate ${Column} references)
  const variablePrompts = variables
    .map(v => {
      let description = v.description;
      // Replace ${Column} with actual values from the row
      description = description.replace(/\$\{([^}]+)\}/g, (match, colName) => {
        return rowData[colName] || match;
      });
      return `- "${v.name}": ${description}`;
    })
    .join('\n');

  const prompt = `You are an expert at analyzing website content and extracting structured information.

Here is the website content:
<content>
${markdown}
</content>

Extract the following information from this website:
${variablePrompts}

IMPORTANT: For yes/no questions, respond with exactly "Yes" or "No" (not 1/0, true/false, or yes/no in lowercase).
Return ONLY a valid JSON object with these exact keys and short answers. Be concise.`;

  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        response_format: {
          type: 'json_object',
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('DeepSeek error response:', JSON.stringify(error));
      throw new Error(`DeepSeek error: ${error.error?.message || error.message || response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error('No response from DeepSeek');
    }

    // Parse the JSON response
    let extracted = JSON.parse(content);

    // Normalize boolean-like values to Yes/No for consistency
    Object.keys(extracted).forEach(key => {
      const val = extracted[key];
      if (val === true || val === 1 || val === '1' || val?.toString().toLowerCase() === 'true') {
        extracted[key] = 'Yes';
      } else if (val === false || val === 0 || val === '0' || val?.toString().toLowerCase() === 'false') {
        extracted[key] = 'No';
      }
    });

    return {
      success: true,
      extracted,
      usage: {
        input_tokens: data.usage?.prompt_tokens || 0,
        output_tokens: data.usage?.completion_tokens || 0,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
    };
  }
}

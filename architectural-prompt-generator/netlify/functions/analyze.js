exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'GEMINI_API_KEY environment variable not set in Netlify.' })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body.' }) };
  }

  const { imageBase64, imageMediaType } = body;
  if (!imageBase64 || !imageMediaType) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing imageBase64 or imageMediaType.' }) };
  }

  const prompt = `You are an expert architectural photographer and AI prompt engineer.
Analyze this architectural image carefully and extract detailed parameters.

Respond ONLY with a valid JSON object — no markdown fences, no backticks, no explanation. Just raw JSON.

Use this exact structure:
{
  "confidence": <integer 0-100>,
  "architectural_style": "<e.g. Modern Tropical, Brutalist, Art Deco, Colonial, Contemporary>",
  "building_type": "<e.g. Residential Villa, Urban Townhouse, Commercial Office>",
  "facade_materials": "<main materials: concrete, glass, wood, brick, steel, etc.>",
  "color_palette": "<dominant colors and tones>",
  "lighting_condition": "<e.g. Golden Hour, Overcast, Midday Sun, Dusk>",
  "vegetation": "<trees, plants, landscaping — or 'None'>",
  "camera_angle": "<e.g. Street-level frontal, Low angle, Three-quarter view>",
  "atmosphere": "<mood: e.g. Serene, Urban Grit, Tropical Lush, Minimalist Clean>",
  "special_features": "<balconies, cantilevers, large windows, carport, pool, etc.>",
  "suggested_prompt": "<a complete Midjourney/Stable Diffusion prompt, 80-120 words, as a vivid photography description using all parameters above>"
}`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: imageMediaType, data: imageBase64 } },
              { text: prompt }
            ]
          }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 1024 }
        })
      }
    );

    const data = await geminiRes.json();

    if (!geminiRes.ok) {
      return {
        statusCode: geminiRes.status,
        body: JSON.stringify({ error: data.error?.message || 'Gemini API error' })
      };
    }

    const parts = data?.candidates?.[0]?.content?.parts;
    if (!parts?.length) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Gemini returned no content. Image may have been blocked by safety filters.' }) };
    }

    const rawText = parts.map(p => p.text || '').join('').trim();
    const jsonStr = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const match = jsonStr.match(/\{[\s\S]*\}/);
    if (!match) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Could not parse Gemini response as JSON.' }) };
    }

    const parsed = JSON.parse(match[0]);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed)
    };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

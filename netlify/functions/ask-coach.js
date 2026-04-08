exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    var body = JSON.parse(event.body);
    var question = body.question;
    var athleteData = body.athleteData;

    var systemPrompt = `You are an expert triathlon and endurance coach AI assistant embedded in a training dashboard. You have access to the athlete's real-time training data provided below. Answer questions conversationally, with specific numbers and actionable advice. Be direct, confident, and reference the actual data. Keep responses under 150 words unless the question requires more detail.

ATHLETE DATA:
` + JSON.stringify(athleteData, null, 0);

    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: 'user', content: question }]
      })
    });

    var data = await response.json();
    var reply = data.content && data.content[0] ? data.content[0].text : 'Sorry, I could not generate a response.';

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply: reply })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply: 'Error: ' + err.message })
    };
  }
};

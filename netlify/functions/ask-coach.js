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

    var todayIso = new Date().toISOString().slice(0, 10);
    var weekdays = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    var weekdayFor = function(iso) {
      return weekdays[new Date(iso + 'T00:00:00Z').getUTCDay()];
    };
    var todayName = weekdayFor(todayIso);

    var annotateSessions = function(arr) {
      if (!Array.isArray(arr)) return arr;
      return arr.map(function(s) {
        if (!s || !s.date) return s;
        var wd = weekdayFor(s.date);
        var rel = s.date === todayIso ? 'today'
          : s.date < todayIso ? 'past'
          : 'upcoming';
        return Object.assign({}, s, { weekday: wd, relative: rel });
      });
    };
    var enriched = Object.assign({}, athleteData, {
      completed_sessions: annotateSessions(athleteData && athleteData.completed_sessions),
      upcoming_sessions: annotateSessions(athleteData && athleteData.upcoming_sessions),
      missed_sessions: annotateSessions(athleteData && athleteData.missed_sessions),
    });
    if (enriched.this_week && Array.isArray(enriched.this_week.sessions)) {
      enriched.this_week = Object.assign({}, enriched.this_week, { sessions: annotateSessions(enriched.this_week.sessions) });
    }

    var systemPrompt = `You are an expert triathlon and endurance coach AI assistant embedded in a training dashboard. You have access to the athlete's real-time training data provided below. Answer questions conversationally, with specific numbers and actionable advice. Be direct, confident, and reference the actual data. Keep responses under 150 words unless the question requires more detail.

TODAY IS ` + todayName + ' ' + todayIso + `. Every session in the data is pre-labeled with its correct weekday and a "relative" tag (today / past / upcoming). Use those labels verbatim — do not compute your own weekday from an ISO date, and never contradict the pre-labeled weekday. "Tomorrow" means the upcoming session whose date is exactly one day after today.

ATHLETE DATA:
` + JSON.stringify(enriched, null, 0);

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

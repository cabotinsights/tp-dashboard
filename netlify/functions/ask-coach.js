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

WEEKLY PROGRESS — read this carefully:
- compliance_pct is ON-PACE: completed / (completed + missed). Upcoming sessions (today's not-yet-done session, or future sessions later in the week) DO NOT count against compliance until their date has passed.
- If sessions_missed === 0, the athlete is ON PACE for the week — describe them as "on track" or "100% on pace so far", even if there are sessions still to come.
- Never frame mid-week as "X of Y completed" using the full week total — that wrongly counts upcoming sessions as misses. Use sessions_due_to_date as the denominator, or say "X done so far, Y still to come this week".
- A missed session = a past-dated session that wasn't completed. Only those bring compliance below 100%.

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

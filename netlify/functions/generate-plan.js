const DAILY_LIMIT = 10; // max Claude API calls per 24 hours

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL || 'https://vfcfdybqmawirygporic.supabase.co';
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured' }), { status: 500 });
  }

  // --- Rate limiting via Supabase ---
  if (supabaseKey) {
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const countRes = await fetch(
        `${supabaseUrl}/rest/v1/api_usage?select=id&created_at=gte.${since}`,
        { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
      );
      const rows = await countRes.json();
      if (Array.isArray(rows) && rows.length >= DAILY_LIMIT) {
        return new Response(JSON.stringify({ error: `Daily limit reached (${DAILY_LIMIT} requests per 24h). Try again tomorrow.` }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      // Log this request
      await fetch(`${supabaseUrl}/rest/v1/api_usage`, {
        method: 'POST',
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
    } catch (e) {
      console.error('Rate limit check failed:', e);
      // Continue anyway — don't block on rate limit errors
    }
  }

  try {
    const body = await req.json();
    const { name, race_date, event_name, start_weight, goal_weight, week_schedule, experience_level, current_mileage } = body;

    const today = new Date().toISOString().split('T')[0];
    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const scheduleStr = week_schedule.map((type, i) => `${dayNames[i]}: ${type}`).join('\n');

    const prompt = `You are a running coach building a training plan for ${name}.

CONTEXT:
- Today's date: ${today}
- Goal event: ${event_name || 'Race'} on ${race_date}
- Current weight: ${start_weight} lbs, goal: ${goal_weight} lbs
- Experience level: ${experience_level || 'intermediate'}
- Current weekly mileage: ${current_mileage || 'unknown'}

WEEKLY SCHEDULE (fixed):
${scheduleStr}

TASK:
Generate a week-by-week running plan from now until race day. For each week, specify the details for each running day (the days marked "Run Day" or "Long Run" in the schedule above).

Rules:
- Only plan running sessions for days marked "Run Day" or "Long Run"
- Build up mileage gradually (no more than 10% increase per week)
- Include a taper in the final 2 weeks
- For each run, specify: type (easy, tempo, intervals, long), distance, and pace guidance
- Keep it concise — one line per run day

Return ONLY valid JSON in this exact format, no other text:
{
  "plan_name": "string - short name for the plan",
  "total_weeks": number,
  "weeks": [
    {
      "week": 1,
      "label": "string - e.g. Base Building",
      "runs": [
        {
          "day": "string - day name",
          "type": "easy|tempo|intervals|long|recovery",
          "distance": "string - e.g. 3 mi",
          "notes": "string - pace/effort guidance"
        }
      ]
    }
  ],
  "notes": "string - any overall advice"
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Claude API error:', err);
      return new Response(JSON.stringify({ error: 'Failed to generate plan' }), { status: 500 });
    }

    const result = await response.json();
    const text = result.content[0].text;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return new Response(JSON.stringify({ error: 'Invalid plan format' }), { status: 500 });
    }

    const plan = JSON.parse(jsonMatch[0]);

    return new Response(JSON.stringify(plan), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err) {
    console.error('Function error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};

export const config = { path: '/api/generate-plan' };

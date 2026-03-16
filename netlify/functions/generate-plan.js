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
    const { name, race_date, event_name, race_type, recent_time, goal_time, start_weight, goal_weight, week_schedule, experience_level, current_mileage } = body;

    const today = new Date().toISOString().split('T')[0];
    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    // week_schedule can be array of strings OR array of arrays (morning/evening)
    const scheduleStr = week_schedule.map((day, i) => {
      if (Array.isArray(day)) {
        const activities = day.filter(a => a && a !== 'None');
        return `${dayNames[i]}: ${activities.join(' + ') || 'Rest'}`;
      }
      return `${dayNames[i]}: ${day}`;
    }).join('\n');

    const raceInfo = race_type ? `${race_type}${event_name ? ' (' + event_name + ')' : ''}` : (event_name || 'Race');
    const timeInfo = [];
    if (recent_time) timeInfo.push(`Most recent finish time: ${recent_time}`);
    if (goal_time) timeInfo.push(`Goal finish time: ${goal_time}`);

    const prompt = `You are a running coach building a training plan for ${name}.

CONTEXT:
- Today's date: ${today}
- Goal race: ${raceInfo} on ${race_date}
${timeInfo.length ? '- ' + timeInfo.join('\n- ') + '\n' : ''}- Current weight: ${start_weight} lbs, goal: ${goal_weight} lbs
- Experience level: ${experience_level || 'intermediate'}
- Current weekly mileage: ${current_mileage || 'unknown'}

WEEKLY SCHEDULE (fixed — includes both morning and evening sessions):
${scheduleStr}

IMPORTANT: Look at ALL activities across both morning AND evening. A day like "Gym Lift + Run Day" means the person lifts in the morning and runs in the evening. You must plan runs for ANY day that includes "Run Day" or "Long Run" in either slot.

TASK:
Generate a week-by-week running plan from now until race day. For each week, specify the details for each running day (any day that has "Run Day" or "Long Run" in the schedule above, whether morning or evening).

${race_type ? `This is a ${race_type} training plan. Structure the mileage buildup appropriately for the ${race_type} distance.` : ''}
${goal_time ? `The runner wants to finish in ${goal_time}. Pace guidance should work toward this goal.` : ''}
${recent_time ? `Their most recent ${race_type || 'race'} time was ${recent_time}. Use this as a baseline for current fitness.` : ''}

Rules:
- Plan runs for EVERY day that has "Run Day" or "Long Run" in the schedule (morning or evening)
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

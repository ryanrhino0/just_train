const DAILY_LIMIT = 10; // shared with generate-plan

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://vfcfdybqmawirygporic.supabase.co';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_KEY');

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured' }), { status: 500 });
  }

  // Rate limiting
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
      await fetch(`${supabaseUrl}/rest/v1/api_usage`, {
        method: 'POST',
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
    } catch (e) {
      console.error('Rate limit check failed:', e);
    }
  }

  try {
    const body = await req.json();
    const { name, goals, start_weight, goal_weight, day_types, week_schedule } = body;

    const goalDescriptions = (goals || []).map(g => {
      if (g === 'weight_loss') return `Weight loss: currently ${start_weight || '?'} lbs, goal ${goal_weight || '?'} lbs`;
      if (g === 'event') return 'Training for a race/event';
      if (g === 'gym_pr') return 'Chasing gym PRs';
      return 'General fitness';
    }).join('. ');

    const scheduleDesc = week_schedule ? week_schedule.map((day, i) => {
      const dayName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][i];
      const activities = Array.isArray(day) ? day.filter(a => a !== 'None') : [day];
      return `${dayName}: ${activities.join(' + ') || 'None'}`;
    }).join(', ') : 'not specified';

    const prompt = `You are a sports nutritionist. Generate daily calorie, protein (grams), and water (oz) targets for a person with these details:

Name: ${name || 'Athlete'}
Goals: ${goalDescriptions}
Current weight: ${start_weight || 'unknown'} lbs
Goal weight: ${goal_weight || 'unknown'} lbs
Weekly schedule: ${scheduleDesc}

Generate targets for each of these activity types: ${day_types.join(', ')}

Guidelines:
- For weight loss, create a moderate deficit (300-500 cal below maintenance)
- Higher calories on heavy training days (long runs, lifting)
- Rest/yoga days should have the lowest calories
- Protein should be 0.8-1.2g per pound of goal body weight depending on activity
- Water should be 80-120 oz, more on active days
- Be practical and realistic

Return ONLY valid JSON, no other text:
{
  ${day_types.map(t => `"${t}": { "cal": number, "protein": number, "water": number }`).join(',\n  ')}
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
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Claude API error:', err);
      return new Response(JSON.stringify({ error: 'Failed to generate targets' }), { status: 500 });
    }

    const result = await response.json();
    const text = result.content[0].text;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return new Response(JSON.stringify({ error: 'Invalid format' }), { status: 500 });
    }

    const targets = JSON.parse(jsonMatch[0]);

    return new Response(JSON.stringify(targets), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err) {
    console.error('Function error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};

export const config = { path: '/api/generate-targets' };

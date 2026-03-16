# Training Tracker App — Claude Code Brief

## What We're Building
A personal fitness tracking PWA (Progressive Web App) for Ryan Veres. Single HTML file, connects to Supabase for persistent storage, deployed via GitHub → Netlify auto-deploy.

---

## Credentials

**Supabase:**
- Project URL: `https://vfcfdybqmawirygporic.supabase.co`
- Anon Key: `sb_publishable_r2DsBlPmISTTViQbG0PQXg_2WljdYu4`

**Supabase Table:** `logs`
Columns required (create via Supabase dashboard or migration):
```sql
create table logs (
  id bigint generated always as identity primary key,
  date text unique not null,
  cal integer default 0,
  protein integer default 0,
  water integer default 0,
  weight float4,
  day_type text default 'Rest',
  workout_done boolean default false,
  notes text,
  created_at timestamp with time zone default now()
);
```

---

## Stack
- **Frontend:** Single `index.html` file — vanilla JS, no build step needed
- **Database:** Supabase (Postgres) via `@supabase/supabase-js` CDN
- **Hosting:** Netlify, auto-deploys from GitHub on every push
- **Fonts:** Google Fonts (DM Sans + DM Mono)

---

## File Structure
Keep it dead simple:
```
training-log/
├── index.html        ← entire app lives here
├── manifest.json     ← PWA manifest so it installs on home screen
└── CLAUDE_CODE_BRIEF.md
```

---

## index.html — Full Requirements

### Meta / PWA Tags (in <head>)
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Training Log">
<meta name="theme-color" content="#0a0a0a">
<link rel="manifest" href="manifest.json">
```

### Supabase CDN
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
```

---

## App Logic

### Constants
```js
const SUPABASE_URL = 'https://vfcfdybqmawirygporic.supabase.co';
const SUPABASE_KEY = 'sb_publishable_r2DsBlPmISTTViQbG0PQXg_2WljdYu4';
const RACE_DATE = new Date('2026-05-09');
const START_WEIGHT = 200;
const GOAL_WEIGHT = 180;
const WEEK_SCHEDULE = ['Long Run','Lift Only','Run Day','Lift Only','Rest','Climb','Lift Only'];
// Index 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
```

### Calorie / Macro Targets by Day Type
```js
const TARGETS = {
  'Rest':      { cal: 1750, protein: 190, water: 100 },
  'Lift Only': { cal: 1950, protein: 200, water: 100 },
  'Run Day':   { cal: 2000, protein: 190, water: 100 },
  'Long Run':  { cal: 2200, protein: 190, water: 100 },
  'Climb':     { cal: 2000, protein: 190, water: 100 },
};
```

### Supabase Operations

**Fetch all logs on load:**
```js
const { data, error } = await db.from('logs').select('*');
```

**Save/update a day (upsert on date conflict):**
```js
await db.from('logs').upsert({
  date,         // "2026-03-16" format
  cal,
  protein,
  water,
  weight,       // float or null
  day_type,
  workout_done, // boolean
  notes
}, { onConflict: 'date' });
```

**Debounce saves** — wait 800ms after last keystroke before calling upsert. Don't hammer the DB on every keypress.

---

## UI Sections

### Header (always visible)
- "Ryan Veres" label + "Training Log" title
- Countdown: days until May 9, 2026 race (big orange number)
- Stats bar: Current Weight | Lost | To Go (goal 180) | 7-day avg calories
- Two tabs: **Today** | **History**

### Sync Status Bar (below header)
- Small dot + text: green "Synced" / amber pulsing "Saving..." / red "Sync error"
- Updates in real time as saves happen

### Today Tab
1. **Date picker** — defaults to today, can go back to log past days
2. **Day type pills** — Rest / Lift Only / Run Day / Long Run / Climb (tap to select, auto-sets targets)
3. **Morning Weight card** — number input in lbs, shows delta from 200lb start
4. **Calories card** — input + progress bar, target from day type
5. **Protein card** — input + progress bar, target from day type
6. **Water card** — input in oz + progress bar, target 100oz
7. **Workout completed toggle** — tap card to check/uncheck, green border when done
8. **Notes textarea** — free text, energy level / food / sleep
9. **Targets reference** — small grid showing today's cal/protein/water targets

### History Tab
- List of all logged days, newest first
- Each card shows: **Score** (0-100) | Date | Weight | Calories | Protein | Day type | Workout done
- Score = average of (cal% hit + protein% hit + workout done) — simple accountability number
- Color coded: green 80+, amber 60-79, red below 60
- Tap any card to jump to that day in Today tab for editing

---

## Design Spec

### Color Palette
```css
--orange: #f97316;   /* primary accent, CTAs */
--green: #22c55e;    /* success, goals hit */
--red: #ef4444;      /* missed targets */
--amber: #f59e0b;    /* partial / warning */
--cyan: #22d3ee;     /* water metric */
--indigo: #6366f1;   /* protein metric */
--bg: #0a0a0a;       /* page background */
--surface: #111111;  /* cards */
--border: #1e1e1e;   /* card borders */
--muted: #555555;    /* secondary text */
```

### Typography
- **Display/Numbers:** DM Mono (monospace feel for stats)
- **Body/UI:** DM Sans
- Both from Google Fonts

### Layout
- Max width 480px, centered — designed for mobile
- Safe area insets for iPhone notch/home bar: `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`
- Bottom padding to account for home bar on iPhone

---

## manifest.json
```json
{
  "name": "Training Log",
  "short_name": "Training",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0a0a",
  "theme_color": "#0a0a0a",
  "icons": [
    {
      "src": "https://fakeimg.pl/192x192/f97316/000000?text=RV&font=lobster",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "https://fakeimg.pl/512x512/f97316/000000?text=RV&font=lobster",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

---

## Netlify Setup (do this once)

1. Push repo to GitHub
2. Go to netlify.com → "Add new site" → "Import from Git"
3. Connect GitHub, select the `training-log` repo
4. Build settings:
   - **Build command:** leave empty (no build step)
   - **Publish directory:** `.` (root)
5. Deploy

From then on: `git push` → Netlify auto-deploys in ~30 seconds.

---

## After Deploy — iPhone Home Screen

1. Open the Netlify URL in **Safari** (not Chrome)
2. Tap the **Share button** (box with arrow)
3. Tap **"Add to Home Screen"**
4. Name it "Training Log" → tap **Add**

Opens fullscreen, no browser chrome, feels like a native app.

---

## Things to Double-Check

- [ ] Supabase `logs` table has `date` column set as **unique** (required for upsert to work)
- [ ] RLS (Row Level Security) is **disabled** on the logs table for now
- [ ] `manifest.json` is referenced in `<head>` of index.html
- [ ] App loads data on boot before rendering (show a spinner while fetching)
- [ ] Saves are debounced — not firing on every single keystroke
- [ ] Date inputs use `YYYY-MM-DD` format consistently (matches Supabase text column)
- [ ] Weight stored as float, not string, in Supabase
- [ ] `workout_done` stored as boolean, not string

---

## What Success Looks Like

1. Open the URL → spinner → data loads from Supabase
2. Log today's weight, calories, protein, water
3. Check workout done
4. See sync dot go amber → green
5. Open Supabase table editor → row is there
6. Open on a different device → same data appears
7. Install on iPhone home screen → opens fullscreen

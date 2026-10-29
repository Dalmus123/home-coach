# Home Coach

Static, dependency-free guided workout player (HTML/CSS/JS, no build step, no CDN).

- `index.html`, `style.css`, `figures.js`, `app.js`: the app
- `sessions.js`: **all session definitions** (edit this to change routines; block types documented at the top)
- `build.py`: inlines everything into one self-contained `dist/index.html`
- `tests/`: headless-Chrome checks (Playwright): `test_app.py` (all sessions), `layout.py` (player fit), `test_recall.py` (recall), `test_pelvic.py`, `test_workout.py` (level table, level-up, streak; assertion-based)

## URLs
- `?s=pelvic&w=1`: Core & pelvic floor (3-5 min habit loop: cue "Same time, same spot, N minutes" → session → "Done ✅ Streak +1"; week 1-2: 5 s hold, 3-4: 8 s, 5+: 10 s; grows ~30-60 s every 2 weeks, ~3:20 → ~7:20 by week 11-12; voice off by default)
- `?s=workout`: Home full-body, 10 levels, no equipment (ab wheel from level 4). Level = 1 + completed workouts / 6 (kept in
  localStorage `coach.done.workout`; roughly 2 weeks per level at 3 a week), so it grows with consistency, not the calendar.
  `?level=N` (or `?w=N`, or the −/+ buttons) previews/overrides a level. Habit loop: cue "Same time, same spot, N minutes" → timed
  warm-up, circuit (work / rest intervals, "Round X of Y · Exercise N of M", a one-line form tip per move), cool-down →
  "Done ✅ Streak +1" with the workout streak (`coach.streakWorkout`) and session count. Home shows "Level N · X min" and the next level.
  Level 1 (~10 min): 1 min warm-up (march, arm circles) → 2 rounds × 6 moves (incline push-ups, squats, table rows, glute bridges,
  reverse lunges, plank), 30 s work / 10 s rest → 1 min cool-down.

  | Level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
  |---|---|---|---|---|---|---|---|---|---|---|
  | Minutes | ~10 | ~12.5 | ~15 | ~17.5 | ~20 | ~23 | ~26 | ~29 | ~32 | ~35 |
  | Sessions needed | 0 | 6 | 12 | 18 | 24 | 30 | 36 | 42 | 48 | 54 |

  Edit the `holdByWeek` table and the exercise variants in `sessions.js` to change it.
- `?s=breaks`: 3-minute desk reset
- `?s=recall`: Recall & consolidate, a 2-minute quiet 'zone out and recall' break (see below)
- Debug: add `&speed=10` to run timers 10x faster.

## Run locally
    python3 -m http.server 8000   # then open http://localhost:8000/?s=pelvic&w=1

## Deploy
Any static host works: GitHub Pages (main branch, root), Netlify Drop, Cloudflare Pages, Vercel.
For a single file, upload `dist/index.html` (re-run `python3 build.py` after edits).

## Recall & consolidate (`?s=recall`)
A 2:00 low-stimulation desk break for replaying the recent past and noting what's worth keeping.
Live: https://dalmus123.github.io/home-coach/?s=recall

| Step | Time | Prompt (one variant per run) |
|---|---|---|
| Settle | 15 s | Sit back, eyes off the screen, breathe in 4 / out 6 |
| First things | 20 s | e.g. "Since you woke up, what happened first?" |
| Food & people | 20 s | e.g. "What did you eat for breakfast, and who did you talk to?" |
| Work & learning | 20 s | e.g. "What did you work on after that? What did you learn or decide?" |
| What stood out | 20 s | e.g. "What felt important or surprising?" |
| Keep | 25 s | e.g. "Pick one or two things worth keeping and write them down." |

- **Time of day** (device clock): before 12:00 the prompts cover the morning since waking. From 12:00 they cover the time
  "since your last break (hh:mm)" if a recall was finished earlier today, otherwise "since this morning" (12:00-13:59) or "since lunch".
- **Variants**: each prompt has 3 wordings. The set moves on by one each time the session is finished (`coach.recallRot`).
  The home overview doesn't show the prompt text, so the prompts still feel fresh during the session.
- **Quiet**: calm glow (a slow 4/6 breathing pulse plus a thin progress ring), a soft chime at each prompt, no countdown ticks.
  Voice is off by default. The "Voice (quiet)" switch turns it on for this session only, at low volume. If voice is off globally,
  recall stays silent too.
- **Notes**: optional notes box during the session (compact), on the end screen and on the recall home screen. Type a line and press Enter.
  Each line is saved to `localStorage` (`coach.recallNotes`, ISO date and time). Today's lines are listed with their times, can be deleted (×), and
  "Copy" puts them on the clipboard. Paper works just as well. Nothing leaves the device.
- End screen: "Done. Back to work." plus today's notes.
- Session data lives in `sessions.js` (block type `reflect`). Edit the prompt arrays there.

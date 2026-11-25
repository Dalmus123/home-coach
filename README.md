# Home Coach

Static, dependency-free guided workout player (HTML/CSS/JS, no build step, no CDN).

- `index.html`, `style.css`, `figures.js`, `app.js`: the app
- `sessions.js`: **all session definitions** (edit this to change routines; block types documented at the top)
- `build.py`: inlines everything into one self-contained `dist/index.html`
- `tests/`: headless-Chrome checks (Playwright): `test_app.py` (all sessions), `layout.py` (player fit), `test_recall.py` (recall), `test_pelvic.py`, `test_workout.py` (level table, level-up, streak; assertion-based), `test_strength.py` (upper/lower/today/short, logging, last time, ladder), `shots.py` (screenshots)

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
- `?s=upper` / `?s=lower`: **Phase 1 strength sessions, about 30 minutes** (Mon & Thu upper, Tue & Sat lower + core). Each opens with a ~3 min
  warm-up (march, arm circles, one light round of the Level circuit at your workout level, capped at level 3), then three supersets (pairs),
  3 sets each, 60-90 s rest after every set of a pair: upper = push-up + row, pike push-up + backpack curl, chair dips + plank; lower = squat + glute bridge,
  reverse lunge + ab-wheel rollout, leg raise + hollow hold. Each move shows its target sets x reps, a cue and a progression step; log reps per set
  (and RIR, reps in reserve, optional). Moves climb a ladder (e.g. incline -> floor -> decline -> archer push-ups): when every set reaches the top of the
  range (and RIR is 1+ if logged) the next session starts one rung up; "Easier / Harder" buttons on the overview override it (`coach.var.<move>`).
  "Last time" per move is kept in `coach.last.<session>` and shown on the overview and in the player. The month (Africa/Nairobi: Nov-Dec, Jan, Feb+) sets
  hold times and rollout reps; `?m=dec|jan|feb` overrides. Finish screen: edit numbers, then Copy summary. The plan source is `sessions.js` (`pairs`).
  Hidden **short day** (about 15 min, the top 3 moves, 2-3 sets): add `&short=1`, e.g. `?s=upper&short=1`. There is deliberately no toggle in the UI.
- `?s=today`: picks the session by weekday in Africa/Nairobi: Mon/Thu upper, Tue/Sat lower, Wed/Fri `easy` (run-walk guidance + 3 min mobility),
  Sun `rest` (rest screen). `?s=today&day=mon` previews a day. `?s=easy` and `?s=rest` also work; they are not in the picker. The overview has a "Today" link.
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

## Session log (completion proof for the coach)
When a session reaches its finish screen (or you leave it with Home / close the tab after starting), `app.js` (`Track`) POSTs one small record
(session, variant, start/finish, duration, steps done/total, the Copy-summary text, per-set reps, device_id) to the `public.session_log` table of the
Supabase project `home-coach` (ref `fohcauwhbyaitjydgrsq`). The publishable key in `app.js` is public by design: RLS allows **INSERT only**.
Fire-and-forget; failed sends wait in localStorage `coach.logq` and retry on the next load / when back online. The easy/rest info screens log nothing.
On localhost logging is off unless `?log=1`; local or `?speed=` runs use a `test-` device_id. Tests: `tests/test_log.py` (mocked; `--live` sends 2 real test rows).

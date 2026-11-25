"""Phase 1 strength sessions (?s=upper, ?s=lower, ?s=today, hidden ?short=1). Exits non-zero on failure.
Usage: python3 -m http.server 8765 &  then  python3 tests/test_strength.py [BASE_URL]"""
import asyncio, sys, datetime
from playwright.async_api import async_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765/"
errors, checks = [], []
def check(n, c, d=None):
    checks.append((n, bool(c), d)); print(("PASS " if c else "FAIL ") + n, "" if c else d)

async def new_page(br):
    ctx = await br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    page = await ctx.new_page()
    page.on("console", lambda m: errors.append(m.text) if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    return page

PLAN = """(k) => { const b = __coach.build(k, 1); const st = b.steps;
  const ov = b.overview.filter(o => o.header).map(o => o.title);
  const warm = st.filter(s => s.sectionKey === 'Warm-up').reduce((a, s) => a + s.dur, 0);
  const work = st.filter(s => s.strength);
  const sets = {}; work.forEach(s => { sets[s.exKey] = (sets[s.exKey] || 0) + 1; });
  const rests = st.filter(s => s.isRest && s.name !== 'Switch' && s.sectionKey !== 'Warm-up').map(s => s.dur);
  return { min: b.total / 60, warm, ov, sets, rests, n: st.length, firstName: st[0].name,
    allInstr: work.every(s => s.instruction && s.instruction.length > 20 && s.progress),
    names: work.map(s => s.name), pairs: [...new Set(work.map(s => s.section))] }; }"""

async def run_session(page, vals, rir):
    """Play through the whole session: skip timed steps, log reps on rep steps."""
    n = 0
    while True:
        s = await page.evaluate("() => { const s = __coach.st; return s.finished ? null : { kind: s.steps[s.i].kind, log: s.steps[s.i].log, top: s.steps[s.i].top }; }")
        if s is None: break
        if s["kind"] == "reps":
            await page.fill("#repsInput", str(vals if vals is not None else s["top"]))
            if rir is not None: await page.fill("#rirInput", str(rir))
            await page.click("#btnDone")
        elif s["log"] == "time":  # let the timed hold run (page is opened with &speed=60)
            i0 = await page.evaluate("() => __coach.st.i")
            await page.wait_for_function(f"() => __coach.st.i !== {i0} || __coach.st.finished", timeout=8000)
        else:
            await page.click("#btnFwd")
        n += 1
        if n > 200: raise RuntimeError("session did not finish")
    return n

async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--autoplay-policy=no-user-gesture-required"])
        page = await new_page(br)
        await page.goto(BASE + "?s=upper"); await page.evaluate("() => localStorage.clear()")

        # --- plan shape
        for key, mon in (("upper", "Mon/Thu"), ("lower", "Tue/Sat")):
            await page.goto(BASE + f"?s={key}")
            pl = await page.evaluate(PLAN, key)
            check(f"{key}: full session is about 30 minutes", 28 <= pl["min"] <= 32, pl["min"])
            check(f"{key}: 3 minute warm-up (shortened Level circuit)", 150 <= pl["warm"] <= 200 and pl["firstName"] == "March in place", (pl["warm"], pl["firstName"]))
            check(f"{key}: three superset pairs", len(pl["pairs"]) == 3 and all(p.startswith("Pair ") for p in pl["pairs"]), pl["pairs"])
            check(f"{key}: 3 working sets per move", set(pl["sets"].values()) == {3} and len(pl["sets"]) == 6, pl["sets"])
            check(f"{key}: 60-90 s rest after each pair set", pl["rests"] and all(60 <= r <= 90 for r in pl["rests"]), pl["rests"])
            check(f"{key}: every move has a cue and a progression step", pl["allInstr"])
            await page.goto(BASE + f"?s={key}&short=1")
            ps = await page.evaluate(PLAN, key)
            check(f"{key}: short day is about 15 minutes", 12 <= ps["min"] <= 16, ps["min"])
            check(f"{key}: short day keeps the top 3 moves x 2-3 sets", len(ps["sets"]) == 3 and sorted(ps["sets"].values()) == [2, 3, 3], ps["sets"])
        pu = await page.evaluate(PLAN, "upper"); await page.goto(BASE + "?s=upper")
        pu = await page.evaluate(PLAN, "upper")
        check("upper moves", pu["names"][0] == "Incline push-ups" and "Backpack curls" in pu["names"] and "Chair dips" in pu["names"] and "Pike push-ups" in pu["names"], pu["names"][:8])
        await page.goto(BASE + "?s=lower"); pl = await page.evaluate(PLAN, "lower")
        check("lower moves", all(n in pl["names"] for n in ("Bodyweight squats", "Reverse lunges", "Glute bridges", "Ab-wheel kneeling rollouts", "Lying leg raises", "Hollow hold")), pl["names"][:8])

        # --- home screen: estimate, no visible short toggle, picker
        await page.goto(BASE + "?s=upper")
        h = await page.evaluate("() => ({sub: ovSub.textContent, total: ovTotal.textContent, note: shortNote.hidden, picker: [...document.querySelectorAll('#picker .pick')].map(b => b.firstChild.textContent), toggles: [...document.querySelectorAll('.switch')].map(e => e.innerText), today: btnToday.textContent})")
        check("home shows estimated duration", h["total"] in ("~30 min", "~29 min", "~31 min") and "Estimated" in h["sub"], h)
        check("no short-day toggle in the UI and no note by default", h["note"] and all("short" not in t.lower() for t in h["toggles"]) and not await page.query_selector("#optShort"), h)
        check("picker lists upper and lower, not easy/rest", "Upper strength" in h["picker"] and "Lower + core" in h["picker"] and "Easy day" not in h["picker"] and "Rest day" not in h["picker"], h["picker"])
        await page.goto(BASE + "?s=upper&short=1")
        sn = await page.evaluate("() => ({hid: shortNote.hidden, t: shortNote.textContent, tot: ovTotal.textContent})")
        check("short note via ?short=1", not sn["hid"] and "Short day (coach's call)" in sn["t"], sn)

        # --- today routing (Africa/Nairobi weekday)
        exp = {"mon": "upper", "tue": "lower", "wed": "easy", "thu": "upper", "fri": "easy", "sat": "lower", "sun": "rest"}
        got = {}
        for d in exp:
            await page.goto(BASE + f"?s=today&day={d}")
            got[d] = await page.evaluate("() => __coach.st.key")
        check("today: Mon/Thu upper, Tue/Sat lower, Wed/Fri easy, Sun rest", got == exp, got)
        nai = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=3)).strftime("%a").lower()
        await page.goto(BASE + "?s=today")
        check("today: real Nairobi weekday", await page.evaluate("() => __coach.st.key") == exp[nai], nai)
        await page.goto(BASE + "?s=today&day=sun")
        rs = await page.evaluate("() => ({start: btnStart.hidden, tip: ovTip.textContent})")
        check("rest screen: no Play, rest message", rs["start"] and "Full rest" in rs["tip"], rs)
        await page.goto(BASE + "?s=today&day=fri")
        ez = await page.evaluate("() => ({start: btnStart.hidden, tip: ovTip.textContent, n: __coach.st.key})")
        check("easy screen: run-walk guidance + mobility player", not ez["start"] and "run-walk" in ez["tip"] and "2 min easy running" in ez["tip"], ez)

        # --- play + log + last time + summary + ladder
        await page.goto(BASE + "?s=upper"); await page.evaluate("() => localStorage.clear()")
        await page.goto(BASE + "?s=upper&speed=60"); await page.click("#btnStart")
        await page.wait_for_timeout(200)
        await page.evaluate("() => { const s = __coach.st; while (s.steps[s.i].section === 'Warm-up') document.getElementById('btnFwd').click(); }")
        st = await page.evaluate("() => { const s = __coach.st.steps[__coach.st.i]; return { name: s.name, kind: s.kind, rir: !rirWrap.hidden, prog: pProg.textContent, instr: pInstr.textContent, target: s.target }; }")
        check("rep step: target, cue, progression, RIR box", st["kind"] == "reps" and st["target"] == "6–12" and st["rir"] and "First time" in st["prog"] and "Progress:" in st["prog"] and len(st["instr"]) > 20, st)
        await run_session(page, 9, 2)
        done = await page.evaluate("() => ({txt: dText.textContent, extra: dExtra.textContent, logs: Object.keys(__coach.st.logs).length})")
        t = done["txt"]
        check("summary: date/session header + time", t.startswith("Upper strength (Mon & Thu) · ") and "\nTime: " in t, t[:80])
        check("summary: each exercise with sets x reps and RIR", "Incline push-ups: 3 sets × 9 / 9 / 9 reps (target 6–12) · RIR 2/2/2" in t and "Plank: 3 sets × 25 / 25 / 25 s" in t and "Backpack curls: 3 sets × 9 / 9 / 9 reps" in t, t)
        check("summary: warm-up completion kept", "Warm-up:" in t, t)
        check("no ladder move up when reps below the top", "Keep the same moves" in done["extra"], done["extra"])
        last = await page.evaluate("() => JSON.parse(localStorage.getItem('coach.last.upper'))")
        check("last time saved per exercise", last and last["ex"]["pushup"]["vals"] == [9, 9, 9] and last["ex"]["pushup"]["rir"] == [2, 2, 2] and last["ex"]["plank"]["unit"] == "s", last and list(last["ex"]))
        await page.goto(BASE + "?s=upper&speed=60")
        ov = await page.evaluate("() => [...document.querySelectorAll('#ovList .d')].map(e => e.textContent).filter(t => t.includes('last'))")
        check("overview shows last time", any("last 9 / 9 / 9 reps · RIR 2/2/2" in x for x in ov), ov[:3])
        await page.click("#btnStart"); await page.wait_for_timeout(100)
        await page.evaluate("() => { const s = __coach.st; while (s.steps[s.i].section === 'Warm-up') document.getElementById('btnFwd').click(); }")
        pg = await page.evaluate("() => pProg.textContent")
        check("player shows last time", "Last time: 9 / 9 / 9 reps · RIR 2/2/2" in pg, pg)
        # top of range every set -> move up the ladder; edit on the done screen updates the summary
        await run_session(page, 12, 1)
        done = await page.evaluate("() => ({extra: dExtra.textContent, var: localStorage.getItem('coach.var.pushup')})")
        check("move up when every set hits the top (push-ups -> floor)", "Move up next time" in done["extra"] and "Floor push-ups" in done["extra"] and done["var"] == "1", done)
        await page.fill(".log-row input >> nth=0", "11")
        t2 = await page.evaluate("() => dText.textContent")
        check("editing the log on the done screen updates the summary", "Incline push-ups: 3 sets × 11 / 12 / 12 reps" in t2, t2[:300])
        await page.goto(BASE + "?s=upper")
        nm = await page.evaluate("() => __coach.build('upper', 1).steps.find(s => s.strength).name")
        check("next session starts at the new rung", nm == "Floor push-ups", nm)
        await page.click("#picker .pick >> nth=0")
        await page.goto(BASE + "?s=upper")
        await page.evaluate("() => { document.querySelectorAll('#ovList .lad-btn')[0].click(); }")
        nm = await page.evaluate("() => __coach.build('upper', 1).steps.find(s => s.strength).name")
        check("'Easier' button steps back down", nm == "Incline push-ups", nm)

        # --- timed exercise logging (hollow hold)
        await page.goto(BASE + "?s=lower"); await page.evaluate("() => localStorage.clear()")
        await page.goto(BASE + "?s=lower&speed=60"); await page.click("#btnStart")
        await run_session(page, None, None)
        tl = await page.evaluate("() => dText.textContent")
        check("lower summary: rollouts, hollow hold in seconds", "Ab-wheel kneeling rollouts: 3 sets × 8 / 8 / 8 reps (target 8)" in tl and "Hollow hold: 3 sets ×" in tl and " s" in tl, tl)

        # --- layout on iPhone 13 (390x844) during a rep step and a timed step
        for key in ("upper", "lower"):
            await page.goto(BASE + f"?s={key}"); await page.click("#btnStart")
            await page.evaluate("() => { const s = __coach.st; while (s.steps[s.i].section === 'Warm-up') document.getElementById('btnFwd').click(); }")
            r = await page.evaluate("() => ({sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, done: btnDone.getBoundingClientRect().bottom, play: btnPlay.getBoundingClientRect().bottom})")
            check(f"{key}: rep step fits 390x844 without scrolling", r["sw"] <= 390 and r["sh"] <= 844 and r["done"] <= 844 and r["play"] <= 844, r)

        # --- existing sessions untouched
        await page.goto(BASE + "?s=workout"); await page.evaluate("() => localStorage.clear()"); await page.goto(BASE + "?s=workout")
        ex = await page.evaluate("() => ({w: Math.round(__coach.build('workout', 1).total / 60), p: __coach.build('pelvic', 7).steps.length, b: __coach.build('breaks', 1).steps.length, r: __coach.build('recall', 1).steps.length, key: __coach.st.key, rir: rirWrap.hidden, start: btnStart.hidden})")
        check("workout/pelvic/breaks/recall still build", ex["w"] == 10 and ex["p"] >= 4 and ex["b"] > 3 and ex["r"] > 3 and ex["key"] == "workout" and not ex["start"], ex)
        await page.click("#btnStart"); await page.wait_for_timeout(150)
        check("workout player has no RIR box or progress line", await page.evaluate("() => rirWrap.hidden && pProg.hidden"))
        await page.goto(BASE + "?s=pelvic&w=7")
        check("pelvic ?w=7 still selects week 7", await page.evaluate("() => __coach.st.week") == 7)
        await page.goto(BASE + "?s=breaks"); check("?s=breaks loads", await page.evaluate("() => __coach.st.key") == "breaks")
        await page.goto(BASE + "?s=recall"); check("?s=recall loads", await page.evaluate("() => __coach.st.key") == "recall")
        await page.goto(BASE + "?s=upper"); await page.evaluate("() => localStorage.clear()")

        await br.close()
    check("no console errors", not errors, errors[:3])
    bad = [c for c in checks if not c[1]]
    print(f"{len(checks) - len(bad)}/{len(checks)} passed")
    sys.exit(1 if bad else 0)
asyncio.run(main())

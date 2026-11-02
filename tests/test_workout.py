"""Workout (home full-body, level-driven) checks. Exits non-zero on failure.
Usage: python3 -m http.server 8765 &  then  python3 tests/test_workout.py [BASE_URL]"""
import asyncio, sys
from playwright.async_api import async_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765/"
errors, checks = [], []
def check(n, c, d=None): checks.append((n, bool(c), d))
KEGEL = "Squeeze the pelvic floor gently at the top, as in a kegel, while keeping your breath flowing."

async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--autoplay-policy=no-user-gesture-required"])
        ctx = await br.new_context(viewport={"width": 390, "height": 664}, device_scale_factor=2, is_mobile=True, has_touch=True)
        page = await ctx.new_page()
        page.on("console", lambda m: errors.append(m.text) if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        await page.goto(BASE + "?s=workout")
        await page.evaluate("() => localStorage.clear()")
        await page.goto(BASE + "?s=workout")

        # level table
        info = await page.evaluate("""() => { const o = {}; for (let l = 1; l <= 11; l++) { const p = __coach.build('workout', l);
          o[l] = {min: p.total / 60, n: p.steps.length, cue: p.cue}; }
          const p1 = __coach.build('workout', 1);
          o.sec = [...new Set(p1.steps.map(s => s.section))];
          o.p1 = p1.steps.map(s => ({n: s.name, d: s.dur, m: s.meta || '', t: s.instruction, ph: s.phases.map(x => x.label)}));
          return o; }""")
        mins = [info[str(l)]["min"] for l in range(1, 11)]
        check("level 1 is about 10 minutes", 9.5 <= mins[0] <= 10.5, mins[0])
        check("peak level is 35-40 minutes", 35 <= mins[9] <= 40, mins[9])
        check("each level adds 2-3.5 minutes (L2..L10)", all(2 <= b - a <= 3.5 for a, b in zip(mins[:9], mins[1:10]) if a), [round(b - a, 1) for a, b in zip(mins, mins[1:])])
        check("levels beyond the peak are capped", abs(info["11"]["min"] - mins[9]) < 1e-6)
        check("sections", info["sec"] == ["Warm-up", "Circuit", "Cool-down"], info["sec"])
        check("cue", info["1"]["cue"] == "Same time, same spot, 10 minutes", info["1"]["cue"])
        p1 = info["p1"]
        work = [s for s in p1 if s["m"].startswith("Round ") and "Exercise" in s["m"]]
        check("level 1 circuit: 2 rounds x 6 exercises", len(work) == 12, len(work))
        check("counter text", work[0]["m"] == "Round 1 of 2 · Exercise 1 of 6" and work[-1]["m"] == "Round 2 of 2 · Exercise 6 of 6", [work[0]["m"], work[-1]["m"]])
        check("every exercise has a tip", all(len(s["t"]) > 20 for s in work))
        names = [s["n"] for s in work[:6]]
        check("level 1 exercises", names == ["Incline push-ups", "Squats", "Table rows (knees bent)", "Glute bridges", "Reverse lunges", "Plank"], names)
        kegel = [s["t"] for s in work if "bridge" in s["n"].lower() or "thrust" in s["n"].lower()]
        check("kegel tip on glute bridges", kegel and all(KEGEL in t for t in kegel), kegel)
        th = await page.evaluate(f"() => __coach.build('workout', 9).steps.filter(s => /thrust|bridge/i.test(s.name)).every(s => s.instruction.includes({KEGEL!r}))")
        nm = await page.evaluate("() => [...new Set(__coach.build('workout', 9).steps.map(s => s.name))]")
        check("kegel tip on hip thrusts (high levels)", th and any("Hip thrusts" in n for n in nm), nm)
        check("work phase label", all(s["ph"] == ["Get ready", "Work"] or s["ph"] == ["Work"] for s in work), [s["ph"] for s in work[:2]])
        check("level 4 adds ab wheel rollouts", any("Ab wheel" in n for n in await page.evaluate("() => __coach.build('workout', 4).steps.map(s => s.name)")))
        check("level 3 has no rollouts", not any("Ab wheel" in n for n in await page.evaluate("() => __coach.build('workout', 3).steps.map(s => s.name)")))

        # auto level from completed count
        lv = await page.evaluate("""() => { const r = {}; [0, 5, 6, 11, 12, 53, 54, 200].forEach(n => { localStorage.setItem('coach.done.workout', n); r[n] = __coach.autoLevel('workout'); }); localStorage.removeItem('coach.done.workout'); return r; }""")
        check("level up every 6 completed sessions, capped at 10", lv == {"0": 1, "5": 1, "6": 2, "11": 2, "12": 3, "53": 9, "54": 10, "200": 10}, lv)

        # home screen: level + next target, then overrides
        await page.goto(BASE + "?s=workout")
        await page.evaluate("() => localStorage.setItem('coach.done.workout', 7)")
        await page.goto(BASE + "?s=workout")
        h = await page.evaluate("() => ({lbl: weekLabel.textContent, val: weekVal.textContent, hold: weekHold.textContent, lvl: ovLevel.textContent, hid: ovLevel.hidden, sub: ovSub.textContent, st: __coach.st.week})")
        check("home: Level 2 from 7 sessions", h["st"] == 2 and h["lbl"] == "Level" and h["hold"].startswith("Level 2 · "), h)
        check("home: next level target", h["lvl"].startswith("Next: Level 3 · ") and "after 5 more sessions" in h["lvl"] and "7 done" in h["lvl"], h["lvl"])
        await page.goto(BASE + "?s=workout&level=5")
        w = await page.evaluate("() => [__coach.st.week, weekHold.textContent, ovLevel.textContent]")
        check("?level= override", w[0] == 5 and w[1].startswith("Level 5") and w[2].startswith("Your level: 2"), w)
        await page.goto(BASE + "?s=workout&w=3")
        check("?w= override", (await page.evaluate("() => __coach.st.week")) == 3)
        await page.goto(BASE + "?s=workout&level=99")
        check("override clamped to the peak", (await page.evaluate("() => __coach.st.week")) == 10)
        await page.goto(BASE + "?s=workout&level=2")
        await page.click("#weekPlus")
        check("+ button", (await page.evaluate("() => __coach.st.week")) == 3 and "level=3" in page.url, page.url)

        # run level 1 to the end: streak + count
        await page.goto(BASE + "?s=workout")
        await page.evaluate("() => localStorage.clear()")
        await page.goto(BASE + "?s=workout&speed=60")
        await page.click("#btnStart")
        meta = set(); seenTip = False; kegelShown = False; maxscroll = 0; maxsw = 0
        for _ in range(6000):
            s = await page.evaluate("""() => { const t = __coach.st; return {f: t.finished, m: pMeta.textContent, tip: pInstr.textContent, ph: pPhase.textContent, clk: pClock.textContent,
              sh: btnPlay.getBoundingClientRect().bottom, sw: document.documentElement.scrollWidth, name: pName.textContent}; }""")
            if s["f"]: break
            meta.add(s["m"]); maxscroll = max(maxscroll, s["sh"]); maxsw = max(maxsw, s["sw"])
            if "kegel" in s["tip"]: kegelShown = True
            await page.wait_for_timeout(15)
        check("finished", s["f"])
        check("round/exercise counter shown on screen", "Round 1 of 2 · Exercise 1 of 6" in meta and "Round 2 of 2 · Exercise 6 of 6" in meta, sorted(meta)[:6])
        check("kegel tip shown on screen", kegelShown)
        check("controls fit and no sideways scroll at 390x664", maxscroll <= 664 and maxsw <= 390, [maxscroll, maxsw])
        check("done title", (await page.inner_text("#dTitle")) == "Done ✅ Streak +1", await page.inner_text("#dTitle"))
        t = await page.inner_text("#dTime"); e = await page.inner_text("#dExtra")
        check("done: streak in time line", "1-day streak" in t, t)
        check("done: session count + next level", e.startswith("Workout #1 · Level 1 · 5 more to Level 2"), e)
        ls = await page.evaluate("() => [localStorage.getItem('coach.done.workout'), localStorage.getItem('coach.streakWorkout'), localStorage.getItem('coach.streak')]")
        check("localStorage count and separate streak", ls[0] == "1" and '"count":1' in ls[1] and ls[2] is None, ls)
        await page.screenshot(path="/tmp/workout-done.png")
        # 6th completion levels up
        await page.evaluate("() => localStorage.setItem('coach.done.workout', 5)")
        await page.goto(BASE + "?s=workout&speed=60")
        await page.click("#btnStart")
        for _ in range(6000):
            if await page.evaluate("() => __coach.st.finished"): break
            await page.wait_for_timeout(15)
        e = await page.inner_text("#dExtra")
        check("level-up message after the 6th session", "Level up! Next time: Level 2" in e and "Workout #6" in e, e)
        await page.goto(BASE + "?s=workout")
        check("home now Level 2", (await page.evaluate("() => __coach.st.week")) == 2)
        # pelvic unaffected by the workout level / streak
        await page.goto(BASE + "?s=pelvic&w=4")
        pv = await page.evaluate("() => [__coach.build('pelvic', 4).total, __coach.voiceOn()]")
        check("pelvic untouched (week-based, voice off)", pv == [pv[0], False] and 225 <= pv[0] <= 240, pv)
        await br.close()
    check("no console errors", not errors, errors)
    bad = [c for c in checks if not c[1]]
    for n, ok, d in checks: print(("PASS " if ok else "FAIL ") + n, "" if ok else d)
    sys.exit(1 if bad else 0)
asyncio.run(main())

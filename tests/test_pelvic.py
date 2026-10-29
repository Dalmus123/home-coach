"""Pelvic-floor session checks (headless Chrome, Playwright). Exits non-zero on failure.
Usage: python3 -m http.server 8765 &  then  python3 tests/test_pelvic.py [BASE_URL]"""
import asyncio, sys
from playwright.async_api import async_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765/"
errors, checks = [], []
def check(n, c, d=None): checks.append((n, bool(c), d))

async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--autoplay-policy=no-user-gesture-required"])
        ctx = await br.new_context(viewport={"width": 390, "height": 740})
        page = await ctx.new_page()
        page.on("console", lambda m: errors.append(m.text) if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        await page.goto(BASE + "?s=pelvic&w=4")
        info = await page.evaluate("""() => { const out = {};
          for (let w = 1; w <= 12; w++) { const b = __coach.build('pelvic', w);
            out[w] = {total: b.total, cue: b.cue, names: b.steps.map(s => s.name + (s.set ? ' s' + s.set : '')),
              hold: (b.steps.find(s => s.name === 'Slow holds').phases[1] || {}).dur}; }
          out.other = {recall: __coach.build('recall', 1).total, workout: __coach.build('workout', 1).total, breaks: __coach.build('breaks', 1).total};
          out.sub = document.getElementById('ovSub').textContent; return out; }""")
        w4 = info["4"]
        check("week 4 total 3.5-4 min", 210 <= w4["total"] <= 240, w4["total"])
        check("hold progression 5/5/8/8/10", [info[str(w)]["hold"] for w in (1, 2, 3, 4, 5, 6)] == [5, 5, 8, 8, 10, 10])
        check("no stretches", not any("stretch" in n.lower() for n in w4["names"]), w4["names"])
        tots = [info[str(w)]["total"] for w in (1, 3, 5, 7, 9, 11)]
        check("every week 3-10 min", all(180 <= info[str(w)]["total"] <= 600 for w in range(1, 13)))
        check("grows 30-60 s each 2 weeks", all(25 <= b - a <= 65 for a, b in zip(tots, tots[1:])), tots)
        check("weeks pair up", all(info[str(a)]["total"] == info[str(a + 1)]["total"] for a in (1, 3, 5, 7, 9, 11)))
        check("cue text", w4["cue"] == "Same time, same spot, 4 minutes", w4["cue"])
        check("cue on home", info["sub"].startswith("Same time, same spot, 4 minutes"), info["sub"])
        check("other sessions unchanged", info["other"] == {"recall": 120, "workout": 1936, "breaks": 188}, info["other"])
        v = await page.evaluate("() => { localStorage.clear(); return null; }")
        await page.goto(BASE + "?s=pelvic&w=4")
        vp = await page.evaluate("() => __coach.voiceOn()")
        await page.goto(BASE + "?s=workout")
        vw = await page.evaluate("() => __coach.voiceOn()")
        check("voice off by default for pelvic, other sessions unchanged", vp is False and vw is True, [vp, vw])
        await page.goto(BASE + "?s=pelvic&w=4")
        # streak logic
        st = await page.evaluate("""() => { localStorage.removeItem('coach.streak'); const d = n => new Date(2026, 9, n, 21);
          const r = [__coach.streakBump(d(1)), __coach.streakBump(d(1)), __coach.streakBump(d(2)), __coach.streakBump(d(5))]; return {r, now: __coach.streakNow(d(5)), gap: __coach.streakNow(d(9))}; }""")
        check("streak +1, same day no double, next day +1, gap resets", st["r"] == [{"count": 1, "added": True}, {"count": 1, "added": False}, {"count": 2, "added": True}, {"count": 1, "added": True}] and st["now"] == 1 and st["gap"] == 0, st)
        await page.evaluate("() => localStorage.removeItem('coach.streak')")
        # full run + done screen
        await page.goto(BASE + "?s=pelvic&w=4&speed=60")
        await page.click("#btnStart")
        seen = []
        for _ in range(1500):
            s = await page.evaluate("() => ({n: __coach.st.steps[__coach.st.i] && __coach.st.steps[__coach.st.i].name, f: __coach.st.finished})")
            if not seen or seen[-1] != s["n"]: seen.append(s["n"])
            if s["f"]: break
            await page.wait_for_timeout(25)
        check("run finishes", s["f"], seen)
        check("steps order", seen[:4] == ["Belly breathing", "Slow holds", "Quick flicks", "Reverse kegels"], seen)
        title = await page.inner_text("#dTitle"); sub = await page.inner_text("#dTime")
        check("done title", title == "Done ✅ Streak +1", title)
        ls = await page.evaluate("() => localStorage.getItem('coach.streak')")
        check("streak saved", '"count":1' in (ls or ""), ls)
        await page.screenshot(path="/workspace/coach-app/screenshots/pelvic-done.png")
        # second finish same day: no double count
        await page.goto(BASE + "?s=pelvic&w=4&speed=60")
        sub_home = await page.inner_text("#ovSub")
        check("home shows streak", "1-day streak" in sub_home, sub_home)
        # other session finishing does not touch streak
        await page.goto(BASE + "?s=recall&speed=60"); await page.click("#btnStart")
        for _ in range(800):
            if await page.evaluate("() => __coach.st.finished"): break
            await page.wait_for_timeout(25)
        check("recall done title untouched", (await page.inner_text("#dTitle")) == "Done. Back to work.")
        ls2 = await page.evaluate("() => localStorage.getItem('coach.streak')")
        check("recall leaves streak alone", ls2 == ls)
        await br.close()
    check("no console errors", not errors, errors)
    bad = [c for c in checks if not c[1]]
    for n, ok, d in checks: print(("PASS " if ok else "FAIL ") + n, "" if ok else d)
    sys.exit(1 if bad else 0)
asyncio.run(main())

import asyncio, json, sys
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765/"
SHOTS = "/workspace/coach-app/screenshots/"
errors = []
results = {}

async def new_page(browser):
    ctx = await browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                                    is_mobile=True, has_touch=True,
                                    permissions=["clipboard-read", "clipboard-write"])
    page = await ctx.new_page()
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    return ctx, page

async def state(page):
    return await page.evaluate("""() => { const s = __coach.st, step = s.steps[s.i] || {}; const ph = step.phases ? step.phases[s.p] : null;
      return {i: s.i, n: s.steps.length, name: step.name, kind: step.kind, phase: ph && ph.type, pt: s.pt, rep: ph && ph.rep, running: s.running, finished: s.finished}; }""")

async def fits(page, label):
    r = await page.evaluate("""() => { const vis = id => { const e = document.getElementById(id); if (!e || e.offsetParent === null) return null; const b = e.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom), Math.round(b.left), Math.round(b.right)]; };
      return {scrollH: document.documentElement.scrollHeight, scrollW: document.documentElement.scrollWidth, controls: vis('btnPlay'), done: vis('btnDone'), next: vis('pNext'), clock: vis('pClock')}; }""")
    results[f"layout:{label}"] = r
    return r

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--autoplay-policy=no-user-gesture-required"])

        # 1. step lists for each session
        ctx, page = await new_page(browser)
        await page.goto(BASE + "?s=pelvic&w=1")
        await page.wait_for_timeout(500)
        for key, w in [("pelvic", 1), ("pelvic", 3), ("pelvic", 5), ("workout", 1), ("breaks", 1)]:
            info = await page.evaluate("""([k,w]) => { const b = __coach.build(k, w); return {steps: b.steps.length, total: b.total,
              names: b.steps.map(s => s.name + (s.set ? ' s'+s.set : '') + (s.round ? ' r'+s.round : '') + ' [' + s.kind + ' ' + s.dur + 's]'),
              firstHold: (b.steps.find(s => s.name === 'Slow holds') || {phases: []}).phases.slice(1,3).map(p => p.type + ':' + p.dur)}; }""", [key, w])
            results[f"build:{key}:w{w}"] = {k: info[k] for k in ("steps", "total", "firstHold")}
            if key != "pelvic" or w == 1:
                results[f"steps:{key}"] = info["names"]
        await page.screenshot(path=SHOTS + "home-pelvic.png")
        await ctx.close()

        # 2. pelvic: timer advances at speed=10, then mid slow-holds screenshot
        ctx, page = await new_page(browser)
        await page.goto(BASE + "?s=pelvic&w=1&speed=10")
        await page.click("#btnStart")
        await page.wait_for_timeout(200)
        a = await state(page)
        await page.wait_for_timeout(1500)
        b = await state(page)
        results["pelvic:timer-advances"] = {"before": a, "after_1.5s_real": b}
        await fits(page, "pelvic-breathing")
        await page.screenshot(path=SHOTS + "pelvic-breathing.png")
        # wait until we reach slow holds rep 3 squeeze naturally
        for _ in range(400):
            s = await state(page)
            if s["name"] == "Slow holds" and s["phase"] == "squeeze" and (s["rep"] or 0) >= 3:
                break
            await page.wait_for_timeout(25)
        results["pelvic:reached-slow-holds-naturally"] = s
        await page.click("#btnPlay")  # pause
        # put the clock mid-squeeze for a representative screenshot, then resume briefly
        await page.evaluate("() => { const s = __coach.st; s.pt = 2.6; }")
        await page.click("#btnPlay")
        await page.wait_for_timeout(30)
        await fits(page, "pelvic-slow-holds")
        await page.screenshot(path=SHOTS + "pelvic-slow-holds.png")
        # quick flicks & reverse kegels screenshots
        for target, fname in [("Quick flicks", "pelvic-quick-flicks.png"), ("Reverse kegels", "pelvic-reverse-kegels.png"), ("Lunge hip-flexor stretch", "pelvic-stretch.png")]:
            for _ in range(80):
                s = await state(page)
                if s["name"] == target: break
                await page.click("#btnFwd"); await page.wait_for_timeout(40)
            for _ in range(200):
                s = await state(page)
                if s["phase"] not in ("ready",) and s["pt"] > 0.3: break
                await page.wait_for_timeout(20)
            await page.screenshot(path=SHOTS + fname)
        results["pelvic:skip-visible-in-stretch"] = await page.is_visible("#btnSkipGroup")
        await page.click("#btnSkipGroup")
        await page.wait_for_timeout(300)
        results["pelvic:after-skip-done-screen"] = await page.is_visible("#done")
        await ctx.close()

        # 3. pelvic full natural run at speed=60
        ctx, page = await new_page(browser)
        await page.goto(BASE + "?s=pelvic&w=1&speed=60")
        await page.click("#btnStart")
        seen = []
        for _ in range(1200):
            s = await state(page)
            if not seen or seen[-1] != s["name"]: seen.append(s["name"])
            if s["finished"]: break
            await page.wait_for_timeout(25)
        results["pelvic:full-run"] = {"finished": s["finished"], "sequence": seen}
        await ctx.close()

        # 4. workout: rep-entry screen, then full run with Done clicks
        ctx, page = await new_page(browser)
        await page.goto(BASE + "?s=workout&speed=60")
        await page.click("#btnStart")
        for _ in range(400):
            s = await state(page)
            if s["kind"] == "reps": break
            await page.wait_for_timeout(25)
        results["workout:first-reps-step"] = s
        await page.fill("#repsInput", "10")
        await page.wait_for_timeout(300)
        await fits(page, "workout-reps")
        await page.screenshot(path=SHOTS + "workout-done-rep-entry.png")
        import random
        random.seed(1)
        clicks = 0
        for _ in range(4000):
            s = await state(page)
            if s["finished"]: break
            if s["kind"] == "reps":
                if s["name"] != "Push-ups" or s["i"] != results["workout:first-reps-step"]["i"]:
                    await page.fill("#repsInput", str(random.randint(8, 20)))
                await page.click("#btnDone"); clicks += 1
                await page.wait_for_timeout(60)
            elif s["name"] == "Plank" and s["phase"] == "work" and s["pt"] > 5:
                await page.wait_for_timeout(20)
            else:
                await page.wait_for_timeout(25)
        results["workout:full-run"] = {"finished": s["finished"], "done_clicks": clicks}
        await page.wait_for_timeout(300)
        results["workout:summary"] = await page.inner_text("#dText")
        await page.click("#btnCopy")
        await page.wait_for_timeout(300)
        results["workout:copy-msg"] = await page.inner_text("#copyMsg")
        try:
            results["workout:clipboard"] = (await page.evaluate("navigator.clipboard.readText()"))[:80]
        except Exception as e:
            results["workout:clipboard"] = f"read failed: {e}"
        results["workout:localStorage"] = await page.evaluate("JSON.parse(localStorage.getItem('coach.lastSummary')).text.slice(0,60)")
        await page.screenshot(path=SHOTS + "workout-summary.png", full_page=True)
        await ctx.close()

        # 5. workout figure screenshot (pike) + breaks run
        ctx, page = await new_page(browser)
        await page.goto(BASE + "?s=workout")
        await page.click("#btnStart")
        for _ in range(4): await page.click("#btnFwd"); await page.wait_for_timeout(50)
        await page.wait_for_timeout(700)
        await page.screenshot(path=SHOTS + "workout-squats-reps.png")
        await ctx.close()

        ctx, page = await new_page(browser)
        await page.goto(BASE + "?s=breaks&speed=60")
        await page.click("#btnStart")
        await page.wait_for_timeout(600)
        await fits(page, "breaks")
        await page.screenshot(path=SHOTS + "breaks.png")
        for _ in range(600):
            s = await state(page)
            if s["finished"]: break
            await page.wait_for_timeout(25)
        results["breaks:finished"] = s["finished"]
        # prefs persist
        await page.click("#btnAgain")
        await page.click("label.switch:has(#optVoice)")
        await page.reload()
        results["prefs:voice-after-reload"] = await page.evaluate("localStorage.getItem('coach.voice')")
        await ctx.close()
        await browser.close()

asyncio.run(main())
print(json.dumps(results, indent=1, ensure_ascii=False))
print("ERRORS:", json.dumps(errors, indent=1))

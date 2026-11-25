"""Save 390x844 screenshots of the main screens. Usage: python3 tests/shots.py BASE_URL OUT_DIR"""
import asyncio, sys
from playwright.async_api import async_playwright
BASE, OUT = sys.argv[1], sys.argv[2]
SKIP = "() => { const s = __coach.st; while (s.steps[s.i].section === 'Warm-up') document.getElementById('btnFwd').click(); }"
async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(executable_path="/usr/bin/google-chrome")
        ctx = await br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg = await ctx.new_page()
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        async def shot(url, name, full=False, play=0, skip=False):
            await pg.goto(BASE + url)
            if play:
                await pg.click("#btnStart")
                if skip: await pg.evaluate(SKIP)
                await pg.wait_for_timeout(600)
            await pg.screenshot(path=f"{OUT}/{name}.png", full_page=full)
        await pg.goto(BASE + "?s=upper"); await pg.evaluate("() => localStorage.clear()")
        await shot("?s=upper", "upper-home", full=True)
        await shot("?s=lower", "lower-home", full=True)
        await shot("?s=today", "today-home")
        await shot("?s=today&day=mon", "today-mon-upper-home")
        await shot("?s=today&day=sun", "today-sun-rest")
        await shot("?s=upper&short=1", "upper-short-home")
        await shot("?s=upper", "upper-player-warmup", play=1)
        await shot("?s=upper", "upper-player-set", play=1, skip=True)
        await shot("?s=lower", "lower-player-set", play=1, skip=True)
        await shot("?s=workout", "workout-home", full=True)
        await shot("?s=workout", "workout-player", play=1)
        # finished upper session -> done screen
        await pg.goto(BASE + "?s=upper&speed=60"); await pg.click("#btnStart")
        while not await pg.evaluate("() => __coach.st.finished"):
            s = await pg.evaluate("() => { const s = __coach.st.steps[__coach.st.i]; return [s.kind, s.log]; }")
            if s[0] == "reps": await pg.fill("#repsInput", "10"); await pg.fill("#rirInput", "2"); await pg.click("#btnDone")
            elif s[1] == "time":
                i0 = await pg.evaluate("() => __coach.st.i"); await pg.wait_for_function(f"() => __coach.st.i !== {i0} || __coach.st.finished", timeout=8000)
            else: await pg.click("#btnFwd")
        await pg.wait_for_timeout(300)
        await pg.screenshot(path=f"{OUT}/upper-done.png", full_page=True)
        await pg.goto(BASE + "?s=upper")
        await pg.screenshot(path=f"{OUT}/upper-home-after-session.png", full_page=True)
        print("errors:", errs)
        await br.close()
asyncio.run(main())

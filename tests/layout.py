import asyncio, json
from playwright.async_api import async_playwright
BASE="http://127.0.0.1:8765/"
async def main():
    out={}; errs=[]
    async with async_playwright() as p:
        br = await p.chromium.launch(executable_path="/usr/bin/google-chrome")
        for (w,h) in [(390,844),(390,664),(375,560),(1280,800)]:
            ctx = await br.new_context(viewport={"width":w,"height":h}, device_scale_factor=2, is_mobile=w<800, has_touch=w<800)
            pg = await ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
            for s, fw in [("pelvic",1),("pelvic",0),("workout",3),("breaks",0)]:
                await pg.goto(BASE+f"?s={s}&w=1"); await pg.click("#btnStart")
                for _ in range(fw): await pg.click("#btnFwd")
                await pg.wait_for_timeout(400)
                r = await pg.evaluate("() => ({sh: document.documentElement.scrollHeight, sw: document.documentElement.scrollWidth, tip: document.getElementById('pTip').getBoundingClientRect().bottom|0, play: document.getElementById('btnPlay').getBoundingClientRect().bottom|0})")
                out[f"{w}x{h} {s}+{fw}"] = r
                if (w,h) in [(390,664),(1280,800)] and fw: await pg.screenshot(path=f"/tmp/lay-{w}x{h}-{s}.png")
            await ctx.close()
        await br.close()
    print(json.dumps(out, indent=0)); print("errs", errs)
asyncio.run(main())

"""Recall session checks (headless Chrome via Playwright). Assertion-based; exits non-zero on failure.

Usage: python3 -m http.server 8765 &  then  python3 tests/test_recall.py [BASE_URL]
Screenshots go to screenshots/recall-*.png.
"""
import asyncio, json, sys
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765/"
SHOTS = "/workspace/coach-app/screenshots/"
errors, checks = [], []

def check(name, cond, detail=None):
    checks.append((name, bool(cond), detail))

SPY = """(() => { window.__spoken = [];
  if (window.speechSynthesis) { const orig = speechSynthesis.speak.bind(speechSynthesis);
    speechSynthesis.speak = u => { if (u.text.trim()) window.__spoken.push({text: u.text, volume: u.volume}); return orig(u); }; } })();"""

async def new_page(browser, w, h):
    mobile = w < 800
    ctx = await browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=2, is_mobile=mobile,
                                    has_touch=mobile, permissions=["clipboard-read", "clipboard-write"])
    await ctx.add_init_script(SPY)
    page = await ctx.new_page()
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    return ctx, page

async def layout(page):
    return await page.evaluate("""() => { const b = id => { const e = document.getElementById(id); if (!e || e.offsetParent === null) return null; const r = e.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)]; };
      return {vh: innerHeight, scrollH: document.documentElement.scrollHeight, scrollW: document.documentElement.scrollWidth, vw: innerWidth,
              play: b('btnPlay'), instr: b('pInstr'), notes: b('notesBox'), stage: b('stage')}; }""")

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path="/usr/bin/google-chrome")

        # 1. plan structure, timings, time-of-day + rotation, other sessions unchanged
        ctx, page = await new_page(browser, 390, 664)
        await page.goto(BASE + "?s=recall")
        info = await page.evaluate("""() => { const C = __coach;
          const plan = k => C.build(k, 1, k === 'recall' ? {period: 'morning', since: 'this morning', rot: 0} : undefined);
          const r = plan('recall');
          const am = [0,1,2].map(rot => C.build('recall', 1, {period: 'morning', since: 'this morning', rot}).steps.map(s => s.instruction));
          const pm = C.build('recall', 1, {period: 'afternoon', since: 'your last break (14:05)', rot: 0}).steps.map(s => s.instruction);
          const ctxAm = C.recallContext(new Date(2026, 9, 8, 10, 30)), ctxPm = C.recallContext(new Date(2026, 9, 8, 15, 0));
          return {total: r.total, steps: r.steps.map(s => ({name: s.name, dur: s.dur, anim: s.anim, text: s.instruction, ticks: s.phases.some(p => p.ticks), tone: s.phases[0].tone})),
            am, pm, ctxAm, ctxPm, totals: {pelvic: C.build('pelvic', 1).total, workout: C.build('workout', 1).total, breaks: C.build('breaks', 1).total},
            picker: [...document.querySelectorAll('#picker .pick')].map(b => b.innerText.replace(/\\n/g, ' · ')),
            title: document.getElementById('ovTitle').textContent, voiceLabel: document.getElementById('optVoiceLabel').textContent,
            voiceChecked: document.getElementById('optVoice').checked}; }""")
        steps = info["steps"]
        check("total is 2:00", info["total"] == 120, info["total"])
        check("6 steps: settle + 5 prompts", len(steps) == 6, [s["name"] for s in steps])
        check("settle is 15 s", steps[0]["name"] == "Settle" and steps[0]["dur"] == 15)
        check("prompts are 20-25 s", all(20 <= s["dur"] <= 25 for s in steps[1:]), [s["dur"] for s in steps])
        check("calm glow visual, no ticks, chime tone", all(s["anim"] == "glow" and not s["ticks"] and s["tone"] == "chime" for s in steps))
        check("morning variants rotate", len({tuple(v) for v in info["am"]}) == 3)
        check("morning prompt mentions waking", "woke up" in info["am"][0][1], info["am"][0][1])
        check("afternoon uses {since}", "your last break (14:05)" in info["pm"][1] and "{since}" not in " ".join(info["pm"]), info["pm"][1])
        check("device clock: 10:30 -> morning, 15:00 -> afternoon/lunch",
              info["ctxAm"]["period"] == "morning" and info["ctxPm"]["period"] == "afternoon" and info["ctxPm"]["since"] == "lunch",
              [info["ctxAm"], info["ctxPm"]])
        check("existing session totals unchanged", info["totals"] == {"pelvic": 202, "workout": 1936, "breaks": 188}, info["totals"])
        check("picker lists recall", any(t.startswith("Recall & consolidate") for t in info["picker"]), info["picker"])
        check("voice off by default for recall", info["voiceChecked"] is False and info["voiceLabel"] == "Voice (quiet)")
        await page.screenshot(path=SHOTS + "recall-home-phone.png", full_page=True)
        await ctx.close()

        # 2. phone run: settle + prompt screenshots, notes, layout, full run, done screen
        for (w, h, tag) in [(390, 664, "phone"), (1280, 800, "laptop")]:
            ctx, page = await new_page(browser, w, h)
            await page.goto(BASE + "?s=recall&speed=10")
            await page.click("#btnStart")
            await page.wait_for_timeout(500)
            st = await page.evaluate("() => ({name: __coach.st.steps[__coach.st.i].name, phase: document.getElementById('pPhase').textContent, notes: !document.getElementById('notesBox').hidden && document.getElementById('notesBox').classList.contains('compact')})")
            check(f"{tag}: starts on Settle with compact notes", st["name"] == "Settle" and st["notes"], st)
            await page.click("#btnPlay"); await page.wait_for_timeout(100)
            await page.click("#btnPlay")   # resume (keeps a running render for the screenshot)
            await page.screenshot(path=SHOTS + f"recall-settle-{tag}.png")
            await page.click("#btnFwd"); await page.wait_for_timeout(50); await page.click("#btnFwd")
            await page.fill("#noteInput", f"Breakfast: chai and mandazi ({tag})")
            await page.press("#noteInput", "Enter")
            await page.wait_for_timeout(300)
            lay = await layout(page)
            check(f"{tag}: player fits viewport (no scroll)", lay["scrollH"] <= lay["vh"] + 1 and lay["scrollW"] <= lay["vw"], lay)
            check(f"{tag}: controls visible", lay["play"] and lay["play"][1] <= lay["vh"], lay["play"])
            cnt = await page.inner_text("#notesCount")
            check(f"{tag}: note saved during session", "1 saved today" in cnt, cnt)
            await page.evaluate("() => document.activeElement.blur()")
            await page.screenshot(path=SHOTS + f"recall-prompt-{tag}.png")
            # let it finish naturally
            for _ in range(400):
                if await page.evaluate("__coach.st.finished"): break
                await page.wait_for_timeout(50)
            check(f"{tag}: finishes", await page.evaluate("__coach.st.finished"))
            done = await page.evaluate("""() => ({title: document.getElementById('dTitle').textContent, notesInDone: document.getElementById('notesDone').contains(document.getElementById('notesBox')) || document.getElementById('done').contains(document.getElementById('notesBox')),
               items: [...document.querySelectorAll('#notesList li')].map(li => li.innerText.replace(/\\n/g, ' ')), log: !document.getElementById('dLogBox').hidden,
               stored: JSON.parse(localStorage.getItem('coach.recallNotes')), rot: localStorage.getItem('coach.recallRot'), last: localStorage.getItem('coach.recallLast'), spoken: window.__spoken})""")
            check(f"{tag}: done title", done["title"] == "Done. Back to work.", done["title"])
            check(f"{tag}: notes shown on done screen", done["notesInDone"] and len(done["items"]) == 1 and not done["log"], done["items"])
            check(f"{tag}: localStorage entry has ISO time", done["stored"] and "T" in done["stored"][0]["t"] and done["stored"][0]["text"].startswith("Breakfast"), done["stored"])
            check(f"{tag}: rotation + last break recorded", done["rot"] == "1" and done["last"], [done["rot"], done["last"]])
            check(f"{tag}: no speech (voice off by default)", done["spoken"] == [], done["spoken"])
            await page.fill("#noteInput", "Keep: VAT reconciliation needs the Sept bank statement")
            await page.click("#noteAdd")
            await page.click("#notesCopy"); await page.wait_for_timeout(300)
            msg = await page.inner_text("#notesMsg")
            try: clip = await page.evaluate("navigator.clipboard.readText()")
            except Exception as e: clip = f"read failed: {e}"
            check(f"{tag}: copy works", "Copied" in msg and clip.startswith("Recall notes") and clip.count("\n") == 2, [msg, clip])
            await page.screenshot(path=SHOTS + f"recall-done-{tag}.png", full_page=True)
            # back home: notes visible on home for recall, hidden for other sessions; afternoon wording after a break
            await page.click("#btnAgain"); await page.wait_for_timeout(200)
            home = await page.evaluate("() => ({notes: !document.getElementById('notesBox').hidden && document.getElementById('home').contains(document.getElementById('notesBox'))})")
            check(f"{tag}: notes on recall home", home["notes"])
            if tag == "laptop":
                await page.screenshot(path=SHOTS + "recall-home-laptop.png", full_page=True)
            await page.click("#picker .pick >> nth=2"); await page.wait_for_timeout(100)
            other = await page.evaluate("() => ({hidden: document.getElementById('notesBox').hidden, voiceLabel: document.getElementById('optVoiceLabel').textContent, voice: document.getElementById('optVoice').checked})")
            check(f"{tag}: other sessions: no notes, global voice untouched", other == {"hidden": True, "voiceLabel": "Voice cues", "voice": True}, other)
            await ctx.close()

        # 3. voice: turning it on for recall speaks quietly; global off stays respected
        ctx, page = await new_page(browser, 390, 664)
        await page.goto(BASE + "?s=recall&speed=10")
        await page.click("label.switch:has(#optVoice)")
        await page.click("#btnStart"); await page.wait_for_timeout(400)
        sp = await page.evaluate("window.__spoken")
        check("voice on for recall -> quiet speech", sp and all(abs(x["volume"] - 0.35) < 1e-6 for x in sp), sp)
        await page.goto(BASE + "?s=breaks")
        await page.click("label.switch:has(#optVoice)")   # global voice off
        await page.goto(BASE + "?s=recall")
        v = await page.evaluate("document.getElementById('optVoice').checked")
        check("global voice off -> recall voice off", v is False)
        await ctx.close()
        await browser.close()

asyncio.run(main())
fails = [c for c in checks if not c[1]]
for name, ok, detail in checks:
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f"  -> {json.dumps(detail, ensure_ascii=False)[:400]}"))
print(f"{len(checks) - len(fails)}/{len(checks)} passed")
print("ERRORS:", json.dumps(errors, indent=1))
sys.exit(1 if fails or errors else 0)

"""Session completion logging (?log=1 on localhost; Supabase REST is mocked with page.route). Exits non-zero on failure.
Usage: python3 -m http.server 8765 &  then  python3 tests/test_log.py [BASE_URL] [--live]
--live also sends two REAL rows (device_id 'test-...') to the Supabase project; delete them afterwards (see home-coach-brief/session-log.md)."""
import asyncio, sys, json
from playwright.async_api import async_playwright
args = [a for a in sys.argv[1:] if not a.startswith("--")]
BASE = args[0] if args else "http://127.0.0.1:8765/"
LIVE = "--live" in sys.argv
errors, checks = [], []
def check(n, c, d=None):
    checks.append((n, bool(c), d)); print(("PASS " if c else "FAIL ") + n, "" if c else d)
URL = "**/rest/v1/session_log"

async def new_page(br):
    ctx = await br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    page = await ctx.new_page()
    page.on("console", lambda m: errors.append(m.text) if m.type in ("error", "warning") and "net::ERR" not in m.text and "Failed to load resource" not in m.text else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    return page

def mock(page, status=201, sink=None):
    async def h(route):
        if sink is not None:
            sink.append({"headers": route.request.headers, "body": json.loads(route.request.post_data or "{}")})
        if status == "abort": await route.abort()
        else: await route.fulfill(status=status, body="")
    return page.route(URL, h)

async def play(page, strength):
    n = 0
    while True:
        s = await page.evaluate("() => { const s = __coach.st; return s.finished ? null : { kind: s.steps[s.i].kind, i: s.i, top: s.steps[s.i].top }; }")
        if s is None: return n
        if s["kind"] == "reps":
            await page.fill("#repsInput", str(s["top"] or 8)); await page.click("#btnDone")
        else:
            await page.wait_for_function(f"() => __coach.st.i !== {s['i']} || __coach.st.finished", timeout=20000)
        n += 1
        if n > 300: raise RuntimeError("did not finish")

async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--autoplay-policy=no-user-gesture-required"])

        # 1. finished upper session -> one completed row
        page = await new_page(br); sink = []; await mock(page, sink=sink)
        await page.goto(BASE + "?s=upper&speed=60&log=1"); await page.evaluate("() => localStorage.clear()"); await page.goto(BASE + "?s=upper&speed=60&log=1")
        await page.click("#btnStart"); await play(page, True); await page.wait_for_timeout(500)
        check("upper: exactly one insert", len(sink) == 1, len(sink))
        r = sink[0]["body"] if sink else {}
        check("upper: completed, all steps done", r.get("completed") is True and r.get("steps_done") == r.get("steps_total") and r.get("steps_total", 0) > 20, (r.get("steps_done"), r.get("steps_total")))
        check("upper: session/variant/tz/device", r.get("session") == "upper" and r.get("variant") == "full" and r.get("tz") and str(r.get("device_id", "")).startswith("test-"), r)
        check("upper: summary + per-set reps in payload", "Upper" in r.get("summary", "") and len(r.get("payload", {}).get("logs", [])) >= 18, r.get("summary", "")[:60])
        check("upper: timestamps + ids", r.get("started_at") and r.get("finished_at") and r.get("run_id") and r.get("client_id", "").endswith(":done") and r.get("duration_s", 0) >= 1, r)
        check("upper: public key sent, no service key", sink and "apikey" in sink[0]["headers"] and sink[0]["headers"]["apikey"].startswith("sb_publishable_"))
        check("upper: queue empty after success", await page.evaluate("() => JSON.parse(localStorage.getItem('coach.logq') || '[]').length") == 0)
        dev = r.get("device_id")
        # 2. pelvic week 7 finished
        sink.clear(); await page.goto(BASE + "?s=pelvic&w=7&speed=60&log=1"); await page.click("#btnStart"); await play(page, False); await page.wait_for_timeout(500)
        r2 = sink[0]["body"] if sink else {}
        check("pelvic: one completed insert, week7", len(sink) == 1 and r2.get("completed") is True and r2.get("session") == "pelvic" and r2.get("variant") == "week7", r2.get("variant"))
        check("pelvic: same device_id as upper", r2.get("device_id") == dev)
        # 3. early exit via Home -> completed=false
        sink.clear(); await page.goto(BASE + "?s=upper&speed=60&log=1"); await page.click("#btnStart")
        await page.wait_for_function("() => Object.keys(__coach.st.completed).length >= 3", timeout=20000)
        await page.click("#btnHome"); await page.wait_for_timeout(500)
        r3 = sink[0]["body"] if sink else {}
        check("early exit: one row, completed=false, some steps", len(sink) == 1 and r3.get("completed") is False and r3.get("client_id", "").count(":part") == 1, r3.get("client_id"))
        check("early exit: no duplicate on page close", await page.evaluate("() => { window.dispatchEvent(new Event('pagehide')); return 1; }") and (await page.wait_for_timeout(400)) is None and len(sink) == 1, len(sink))
        # 4. info screens and untouched home: nothing is sent
        sink.clear()
        for u in ("?s=today&day=wed", "?s=today&day=sun", "?s=upper", "?s=pelvic&w=3"):
            await page.goto(BASE + u + "&log=1" if "?" in u else u); await page.wait_for_timeout(300)
        await page.wait_for_timeout(500)
        check("easy/rest/home screens send nothing", len(sink) == 0, len(sink))
        # 5. abandoned tab: closed mid-session -> logged as unfinished on next load
        sink.clear(); await page.goto(BASE + "?s=lower&speed=60&log=1"); await page.click("#btnStart")
        await page.wait_for_function("() => Object.keys(__coach.st.completed).length >= 3", timeout=20000)
        await page.goto(BASE + "?s=today&day=sun&log=1"); await page.wait_for_timeout(800)
        check("abandoned run logged as unfinished next load", len(sink) >= 1 and sink[-1]["body"]["completed"] is False and sink[-1]["body"]["session"] == "lower", [s["body"].get("client_id") for s in sink])
        await page.close()

        # 6. offline: queued, then retried; 5xx keeps, 4xx drops, off by default on localhost
        page = await new_page(br); sink = []; await mock(page, "abort", sink)
        await page.goto(BASE + "?s=pelvic&w=7&speed=60&log=1"); await page.evaluate("() => localStorage.clear()"); await page.goto(BASE + "?s=pelvic&w=7&speed=60&log=1")
        await page.click("#btnStart"); await play(page, False); await page.wait_for_timeout(500)
        check("offline: session still finishes, row queued", await page.evaluate("() => __coach.st.finished && JSON.parse(localStorage.getItem('coach.logq')).length") == 1)
        await page.unroute(URL); ok = []; await mock(page, 201, ok)
        await page.goto(BASE + "?s=today&day=sun&log=1"); await page.wait_for_timeout(800)
        check("offline: retried on next load, queue emptied", len(ok) == 1 and await page.evaluate("() => JSON.parse(localStorage.getItem('coach.logq') || '[]').length") == 0, len(ok))
        await page.unroute(URL); await mock(page, 503)
        await page.goto(BASE + "?s=pelvic&w=7&speed=60&log=1"); await page.click("#btnStart"); await play(page, False); await page.wait_for_timeout(500)
        check("503: row stays queued", await page.evaluate("() => JSON.parse(localStorage.getItem('coach.logq') || '[]').length") == 1)
        await page.unroute(URL); await mock(page, 400)
        await page.goto(BASE + "?s=today&day=sun&log=1"); await page.wait_for_timeout(800)
        check("400: row dropped (never accepted)", await page.evaluate("() => JSON.parse(localStorage.getItem('coach.logq') || '[]').length") == 0)
        await page.unroute(URL); sink = []; await mock(page, 201, sink)
        await page.goto(BASE + "?s=pelvic&w=7&speed=60"); await page.click("#btnStart"); await play(page, False); await page.wait_for_timeout(500)
        check("localhost without ?log=1: nothing sent", len(sink) == 0)
        await page.close()

        if LIVE:
            page = await new_page(br)
            await page.goto(BASE + "?s=pelvic&w=7&speed=60&log=1"); await page.evaluate("() => localStorage.clear()"); await page.goto(BASE + "?s=pelvic&w=7&speed=60&log=1")
            await page.click("#btnStart"); await play(page, False); await page.wait_for_timeout(2500)
            await page.goto(BASE + "?s=upper&speed=60&log=1"); await page.click("#btnStart"); await play(page, True); await page.wait_for_timeout(2500)
            check("LIVE: queue empty (both real inserts accepted)", await page.evaluate("() => JSON.parse(localStorage.getItem('coach.logq') || '[]').length") == 0)
            print("device:", await page.evaluate("() => JSON.parse(localStorage.getItem('coach.deviceId'))"))
            await page.close()
        await br.close()
    check("no console errors", not errors, errors[:3])
    bad = [c for c in checks if not c[1]]
    print(f"{len(checks) - len(bad)}/{len(checks)} passed")
    sys.exit(1 if bad else 0)
asyncio.run(main())

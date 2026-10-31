"""Optional developer regression suite. Application runtime has no Python dependencies.
Install test tooling separately: pip install playwright pillow; playwright install chromium
Run: python tests/browser-check.py [--baseline /path/to/original.html]
"""

import argparse, hashlib, io, json, re, threading, time
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from playwright.sync_api import sync_playwright
from PIL import Image, ImageChops

parser = argparse.ArgumentParser()
parser.add_argument("--project", type=Path, default=Path(__file__).resolve().parents[1])
parser.add_argument("--baseline", type=Path)
parser.add_argument("--report", type=Path)
parser.add_argument("--interactions-only", action="store_true")
args = parser.parse_args()
root = args.project.resolve()
results = []
errors = []
network = []
comparisons = []


def check(name, condition, details=None):
    results.append(
        {
            "test": name,
            "passed": bool(condition),
            **({"details": details} if details is not None else {}),
        }
    )
    if not condition:
        raise AssertionError(name + ": " + str(details))


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


server = ThreadingHTTPServer(("127.0.0.1", 0), partial(Quiet, directory=str(root)))
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{server.server_port}/"


def go(page, hash):
    page.evaluate("(id)=>location.hash=id", hash)
    page.wait_for_timeout(35)
    # Finish source transitions before comparison; do not change source CSS.
    page.wait_for_timeout(240)


def snapshot(page):
    return page.evaluate("""() => {
 const props=['display','position','color','backgroundColor','backgroundImage','borderTopColor','borderRightColor','borderBottomColor','borderLeftColor','borderTopWidth','borderRadius','boxShadow','backdropFilter','fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','padding','margin','gap','gridTemplateColumns','opacity','transform','outline','outlineOffset','overflow','width','height'];
 return [...document.querySelectorAll('body *')].filter(e=>!['SCRIPT','STYLE','LINK','NOSCRIPT'].includes(e.tagName)&&e.getClientRects().length).map(e=>{
 const s=getComputedStyle(e),r=e.getBoundingClientRect();
 return {tag:e.tagName,id:e.id,cls:e.getAttribute('class'),rect:[r.x,r.y,r.width,r.height].map(x=>Math.round(x*1000)/1000),style:Object.fromEntries(props.map(p=>[p,s[p].replace(/url\\([\\s\\S]*?\\)/g,'url(ORIGINAL_ARTWORK)')]))};
 });
 }""")


with sync_playwright() as p:
    browser = p.chromium.launch(args=["--no-sandbox"])
    context = browser.new_context(
        viewport={"width": 1440, "height": 1000}, reduced_motion="reduce"
    )
    page = context.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("requestfailed", lambda r: network.append(r.url + ": " + str(r.failure)))
    page.on(
        "response",
        lambda r: (
            network.append(str(r.status) + " " + r.url) if r.status >= 400 else None
        ),
    )
    page.goto(base, wait_until="networkidle")
    page.wait_for_timeout(300)
    check(
        "ES module initialization and default page",
        page.locator(".page.is-current").get_attribute("id") == "dashboard",
    )
    check(
        "No remote resource requests",
        all(
            x.startswith(base)
            for x in page.evaluate(
                'performance.getEntriesByType("resource").map(x=>x.name)'
            )
        ),
    )
    check(
        "All external stylesheets parsed",
        page.evaluate(
            '[...document.querySelectorAll("head link[rel=stylesheet]")].every(l=>l.sheet&&l.sheet.cssRules.length>0)'
        ),
    )
    pages = page.locator(".page").evaluate_all("(xs)=>xs.map(x=>x.id)")
    themes = page.locator("[data-set-theme]").evaluate_all(
        "(xs)=>xs.map(x=>x.dataset.setTheme)"
    )
    modals = page.locator(".modal").evaluate_all("(xs)=>xs.map(x=>x.id)")
    check("Exactly ten theme choices", len(themes) == 10)
    # Theme switching and complete original/modular cross-product comparison.
    baseline = None
    if args.baseline:
        baseline = context.new_page()
        baseline.route(
            "**/__baseline__.html",
            lambda route: route.fulfill(
                path=str(args.baseline.resolve()), content_type="text/html"
            ),
        )
        baseline.goto(base + "__baseline__.html", wait_until="networkidle")
        baseline.wait_for_timeout(300)
    for theme in ([] if args.interactions_only else themes):
        for target in [page] + ([baseline] if baseline else []):
            go(target, "settings")
            target.locator(f'[data-set-theme="{theme}"]').click()
            target.mouse.move(1439, 999)
            target.wait_for_timeout(250)
        check(
            "Theme " + theme + " selection and indicators",
            page.evaluate(
                '(theme)=>document.documentElement.dataset.theme===theme&&[...document.querySelectorAll("[data-set-theme]")].every(x=>x.getAttribute("aria-pressed")===String(x.dataset.setTheme===theme))',
                theme,
            ),
        )
        for id in pages:
            go(page, id)
            page.mouse.move(1439, 999)
            check(
                theme + " / " + id + " routing",
                page.locator(".page.is-current").get_attribute("id") == id,
            )
            if baseline:
                go(baseline, id)
                baseline.mouse.move(1439, 999)
                a, b = snapshot(baseline), snapshot(page)
                if a != b:
                    diffs = [
                        {"original": x, "modular": y} for x, y in zip(a, b) if x != y
                    ][:3]
                    check(
                        theme + " / " + id + " computed style and geometry parity",
                        False,
                        {"lengths": [len(a), len(b)], "diffs": diffs},
                    )
                shot1 = baseline.screenshot(full_page=True, animations="disabled")
                shot2 = page.screenshot(full_page=True, animations="disabled")
                im1 = Image.open(io.BytesIO(shot1)).convert("RGB")
                im2 = Image.open(io.BytesIO(shot2)).convert("RGB")
                equal = (
                    im1.size == im2.size
                    and ImageChops.difference(im1, im2).getbbox() is None
                )
                if not equal:
                    failure_dir = root / "tests" / "failures"
                    failure_dir.mkdir(parents=True, exist_ok=True)
                    (failure_dir / "original.png").write_bytes(shot1)
                    (failure_dir / "modular.png").write_bytes(shot2)
                check(theme + " / " + id + " full-page pixel parity", equal)
                comparisons.append(
                    {
                        "theme": theme,
                        "page": id,
                        "computed_styles_identical": True,
                        "pixels_identical": True,
                    }
                )
        if baseline:
            for overlay_id in ["create-project", "viewer-1"]:
                go(page, overlay_id)
                go(baseline, overlay_id)
                check(
                    theme + " / " + overlay_id + " dialog style parity",
                    snapshot(page) == snapshot(baseline),
                )
    # Return to source-default theme before interaction tests.
    go(page, "settings")
    page.locator('[data-set-theme="dark"]').click()
    go(page, "dashboard")
    page.locator("[data-theme-toggle]").first.click()
    check(
        "Toolbar theme cycle",
        page.evaluate("document.documentElement.dataset.theme") == "light",
    )
    page.locator("#navigation-toggle").click()
    check(
        "Desktop sidebar collapse",
        "nav-collapsed" in page.locator("body").get_attribute("class"),
    )
    page.locator("#navigation-toggle").click()
    for id in pages:
        go(page, id)
        check(
            "Navigation " + id + " updates page and title",
            page.locator(".page.is-current").get_attribute("id") == id
            and "AutoGenImg Studio" in page.title(),
        )
    # Actual sidebar click, history, and unknown valid hashes.
    go(page, "dashboard")
    page.locator('.nav a[href="#bundle"]').click()
    page.wait_for_timeout(100)
    check(
        "Sidebar click routing",
        page.locator(".page.is-current").get_attribute("id") == "bundle",
    )
    page.go_back()
    page.wait_for_timeout(100)
    check(
        "Browser history navigation",
        page.locator(".page.is-current").get_attribute("id") == "dashboard",
    )
    go(page, "unknown-page")
    check(
        "Unknown route fallback",
        page.locator(".page.is-current").get_attribute("id") == "dashboard",
    )
    for hash, inputid, itemselector, emptyid in [
        ("bundle", "prompt-search", "#bundle .prompt", "prompt-no-results"),
        (
            "gallery",
            "gallery-search",
            "#gallery .gallery-group>.gallery-grid>.gallery-card",
            "gallery-no-results",
        ),
        ("reports", "manifest-search", "#reports tbody tr", "manifest-no-results"),
    ]:
        go(page, hash)
        inp = page.locator("#" + inputid)
        inp.fill("__no_matching_source_text__")
        check(inputid + " empty state", page.locator("#" + emptyid).is_visible())
        inp.fill("")
        check(
            inputid + " restores items",
            page.locator(itemselector + ":visible").count()
            == page.locator(itemselector).count(),
        )
    go(page, "monitor")
    page.locator('[data-log-filter="error"]').click()
    check(
        "Captured log error filter",
        page.locator(".logline:visible").count()
        == page.locator('.logline[data-level="error"]').count(),
    )
    page.locator("#log-search").fill("__nothing__")
    check("Log search empty state", page.locator("#log-no-results").is_visible())
    page.locator("#log-search").fill("")
    page.locator('[data-log-filter="all"]').click()
    go(page, "bundle")
    expand = page.locator("[data-expand]").first
    expand.click()
    check("Full prompt disclosure", expand.get_attribute("aria-expanded") == "true")
    expand.click()
    check("Prompt collapse", expand.get_attribute("aria-expanded") == "false")
    go(page, "references")
    expand = page.locator("#references [data-expand]").first
    expand.click()
    check(
        "Reference mapping disclosure", expand.get_attribute("aria-expanded") == "true"
    )
    expand.click()
    go(page, "gallery")
    page.locator("input[data-asset-select]").first.check()
    check(
        "Asset individual selection",
        page.locator("#selection-count").inner_text() == "1 asset selected",
    )
    page.locator("#preview-selected").click()
    page.wait_for_timeout(150)
    check("Selected asset preview", page.locator("#viewer-1").is_visible())
    page.keyboard.press("ArrowRight")
    page.wait_for_timeout(100)
    check("Viewer next", page.locator("#viewer-2").is_visible())
    page.keyboard.press("ArrowLeft")
    page.wait_for_timeout(100)
    check("Viewer previous", page.locator("#viewer-1").is_visible())
    page.keyboard.press("Escape")
    page.wait_for_timeout(100)
    page.locator("#select-all-assets").click()
    check(
        "Select all gallery assets",
        page.locator("input[data-asset-select]:checked").count() == 5,
    )
    page.locator("#clear-selection").click()
    check(
        "Clear gallery selection",
        page.locator("input[data-asset-select]:checked").count() == 0
        and not page.locator("#selection-tray").is_visible(),
    )
    for density in ["comfortable", "compact"]:
        page.locator(f'button[data-density="{density}"]').click()
        check(
            "Gallery density " + density,
            page.locator("#asset-grid").get_attribute("data-density") == density,
        )
    # Every existing overlay, native hash address, ARIA state and Escape restoration.
    for id in modals:
        go(page, id)
        check(
            "Dialog " + id + " opens",
            page.locator("#" + id).is_visible()
            and page.locator("#" + id).get_attribute("aria-hidden") == "false",
        )
        check(
            "Dialog " + id + " focus",
            page.evaluate(
                "(id)=>document.getElementById(id).contains(document.activeElement)", id
            ),
        )
        check(
            "Dialog " + id + " background inert",
            page.locator(".app").get_attribute("inert") is not None,
        )
        focus = (
            page.locator("#" + id)
            .locator(
                'a[href],button:not(:disabled),input:not(:disabled),[tabindex="0"]'
            )
            .filter(visible=True)
        )
        if focus.count():
            focus.first.focus()
            page.keyboard.press("Shift+Tab")
            check(
                "Dialog " + id + " reverse focus trap",
                focus.last.evaluate("(e)=>e===document.activeElement"),
            )
            page.keyboard.press("Tab")
            check(
                "Dialog " + id + " forward focus trap",
                focus.first.evaluate("(e)=>e===document.activeElement"),
            )
        page.keyboard.press("Escape")
        page.wait_for_timeout(100)
        check("Dialog " + id + " closes", not page.locator("#" + id).is_visible())
    go(page, "dashboard")
    opener = page.locator('#dashboard a[href="#create-project"]').first
    opener.click()
    page.wait_for_timeout(100)
    page.keyboard.press("Escape")
    page.wait_for_timeout(100)
    check(
        "Modal opener focus restoration",
        opener.evaluate("(e)=>document.activeElement===e"),
    )
    opener.click()
    page.wait_for_timeout(100)
    page.locator("#create-project").click(position={"x": 5, "y": 5})
    page.wait_for_timeout(100)
    check("Modal backdrop close", not page.locator("#create-project").is_visible())
    go(page, "guide")
    for i in range(1, 8):
        label = page.locator(f'.guide-steps label[for="guide-{i}"]')
        label.focus()
        page.keyboard.press("Enter")
        check(
            "Guide step " + str(i) + " keyboard",
            page.locator("#guide-" + str(i)).is_checked()
            and label.get_attribute("aria-pressed") == "true",
        )
    go(page, "dashboard")
    page.locator(".skip-link").focus()
    page.keyboard.press("Enter")
    check(
        "Skip link focuses current heading",
        page.locator("#dashboard h1").evaluate("(e)=>e===document.activeElement"),
    )
    check(
        "Screen reader announcements", bool(page.locator("#ui-announcer").inner_text())
    )
    # Reset both documents so responsive parity compares identical transient states.
    page.goto(base, wait_until="networkidle")
    page.mouse.move(0, 0)
    if baseline:
        baseline.goto(base + "__baseline__.html", wait_until="networkidle")
        baseline.mouse.move(0, 0)
    for width, height in [(390, 844), (768, 1024), (1920, 1080)]:
        for target in [page] + ([baseline] if baseline else []):
            target.set_viewport_size({"width": width, "height": height})
            target.reload(wait_until="networkidle")
            target.locator(".utility-bar").click(position={"x": 1, "y": 1})
            target.mouse.move(0, 0)
        for id in pages:
            go(page, id)
            if baseline:
                go(baseline, id)
                a, b = snapshot(baseline), snapshot(page)
                check(
                    f"Responsive {width}px / {id} style parity",
                    a == b,
                    (
                        None
                        if a == b
                        else {
                            "lengths": [len(a), len(b)],
                            "diffs": [
                                {"original": x, "modular": y}
                                for x, y in zip(a, b)
                                if x != y
                            ][:3],
                        }
                    ),
                )
        if width == 390:
            go(page, "dashboard")
            page.locator("#navigation-toggle").click()
            check(
                "Mobile navigation opens",
                "mobile-nav-open" in page.locator("body").get_attribute("class"),
            )
            page.keyboard.press("Escape")
            check(
                "Mobile navigation Escape",
                "mobile-nav-open" not in page.locator("body").get_attribute("class"),
            )
            page.locator("#navigation-toggle").click()
            page.locator("#mobile-backdrop").click(position={"x": 380, "y": 500})
            check(
                "Mobile navigation backdrop",
                "mobile-nav-open" not in page.locator("body").get_attribute("class"),
            )
    # Reduced transparency and print, source-equivalent rules.
    if baseline:
        for media in [{"reduced_transparency": "reduce"}, {"media": "print"}]:
            for target in [page, baseline]:
                if "reduced_transparency" in media:
                    session = context.new_cdp_session(target)
                    session.send(
                        "Emulation.setEmulatedMedia",
                        {
                            "features": [
                                {
                                    "name": "prefers-reduced-transparency",
                                    "value": "reduce",
                                },
                                {"name": "prefers-reduced-motion", "value": "reduce"},
                            ]
                        },
                    )
                else:
                    target.emulate_media(media="print")
                go(target, "reports")
            check(
                "Accessibility media parity " + str(media),
                snapshot(page) == snapshot(baseline),
            )
    # JS-disabled CSS navigation and noscript stylesheet.
    nojs = browser.new_context(
        java_script_enabled=False, viewport={"width": 1440, "height": 1000}
    )
    np = nojs.new_page()
    np.goto(base + "#gallery", wait_until="networkidle")
    check(
        "No-JavaScript gallery fallback",
        np.locator("#gallery").is_visible()
        and not np.locator("#dashboard").is_visible(),
    )
    np.goto(base + "#viewer-1", wait_until="networkidle")
    check("No-JavaScript viewer fallback", np.locator("#viewer-1").is_visible())
    nojs.close()
    # All five decoded images load at their original dimensions.
    dimensions = page.evaluate(
        """async () => { const a=[]; for(let n=1;n<=5;n++){const img=new Image();img.src=`assets/artwork/art-${n}.png`;await img.decode();a.push([img.naturalWidth,img.naturalHeight]);} return a;}"""
    )
    check(
        "All extracted PNGs decode",
        all(w > 0 and h > 0 for w, h in dimensions),
        dimensions,
    )
    check("No application console errors", not errors, errors)
    check("No failed application requests", not network, network)
    browser.close()
server.shutdown()
report = {
    "browser": "Playwright Chromium",
    "viewport": "1440x1000; responsive 390x844, 768x1024, 1920x1080",
    "baseline_comparisons": len(comparisons),
    "all_passed": all(r["passed"] for r in results),
    "test_count": len(results),
    "pages": pages,
    "themes": themes,
    "dialogs": modals,
    "tests": results,
    "comparisons": comparisons,
    "console_errors": errors,
    "failed_requests": network,
}
reportpath = args.report or root / "tests" / "validation-report.json"
reportpath.parent.mkdir(parents=True, exist_ok=True)
reportpath.write_text(json.dumps(report, indent=2) + "\n")
print(
    json.dumps(
        {
            k: report[k]
            for k in [
                "browser",
                "baseline_comparisons",
                "all_passed",
                "test_count",
                "console_errors",
                "failed_requests",
            ]
        },
        indent=2,
    )
)

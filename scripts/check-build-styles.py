"""Check CSS linked by the built Chrome, Firefox and playground entry pages.

Run after npm run build and npm run build:web. App scripts are omitted so the
test measures shipped CSS without extension permissions, user data or network.
"""
import mimetypes
import os
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlparse

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
TARGETS = [
    ("Chrome", ROOT / "apps/extension/.output/chrome-mv3", "newtab.html"),
    ("Firefox", ROOT / "apps/extension/.output/firefox-mv3", "newtab.html"),
    ("playground", ROOT / "apps/playground/dist", "index.html"),
]


class Stylesheets(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.links = []
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "link" and attrs.get("rel") == "stylesheet":
            self.links.append(attrs["href"])


with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path=os.environ.get("MYRIAD_BROWSER", "/usr/bin/google-chrome"),
        headless=True,
    )
    checks = 0
    for name, dist, entry in TARGETS:
        html = (dist / entry).read_text()
        links = Stylesheets(html).links
        assert links, f"{name}: entry page does not link any CSS"
        for href in links:
            assert (dist / urlparse(href).path.lstrip("/")).is_file(), (name, href)
        html = re.sub(r"<script\b[^>]*>.*?</script>", "", html, flags=re.S)
        page = browser.new_page(viewport={"width": 1440, "height": 900})

        def serve(route):
            parsed = urlparse(route.request.url)
            file = (dist / unquote(parsed.path).lstrip("/")).resolve()
            if parsed.hostname != "styles.test" or not file.is_relative_to(dist.resolve()):
                route.abort()
            elif parsed.path == "/" + entry:
                route.fulfill(body=html, content_type="text/html")
            elif file.suffix == ".css" and file.is_file():
                route.fulfill(body=file.read_bytes(), content_type="text/css")
            else:
                route.fulfill(body="", content_type=mimetypes.guess_type(str(file))[0] or "text/plain")

        page.route("**/*", serve)
        page.goto("https://styles.test/" + entry, wait_until="networkidle")
        page.locator("#app").evaluate("""el => {
            el.innerHTML = '<div class="myriad"><button class="m-btn">样式检查</button></div>';
        }""")
        backgrounds = {
            "fufu-blue": {"dark": "rgb(20, 21, 33)", "light": "rgb(244, 246, 250)"},
            "hutao-red": {"dark": "rgb(58, 27, 25)", "light": "rgb(252, 240, 225)"},
        }
        for palette, themes in backgrounds.items():
            for theme, background in themes.items():
                styles = page.locator(".myriad").evaluate("""(el, variant) => {
                    el.dataset.palette = variant.palette;
                    el.dataset.theme = variant.theme;
                    const root = getComputedStyle(el);
                    const button = getComputedStyle(el.querySelector('button'));
                    return {
                        bg: root.getPropertyValue('--bg').trim(),
                        text: root.getPropertyValue('--text').trim(),
                        background: root.backgroundColor,
                        color: root.color,
                        fontSize: root.fontSize,
                        boxSizing: button.boxSizing,
                        buttonDisplay: button.display,
                        buttonRadius: button.borderRadius,
                    };
                }""", {"palette": palette, "theme": theme})
                assert styles["bg"] and styles["text"], (name, palette, theme, "missing theme variables", styles)
                assert styles["background"] == background, (name, palette, theme, styles)
                assert styles["fontSize"] == "14px", (name, theme, styles)
                assert styles["boxSizing"] == "border-box", (name, theme, styles)
                assert styles["buttonDisplay"] == "inline-flex", (name, theme, styles)
                assert float(styles["buttonRadius"].removesuffix("px")) >= 100, (name, theme, styles)
                checks += 1
                print(f"PASS {name} {palette} {theme}: linked theme and base CSS applied", flush=True)
        page.close()
    browser.close()
print(f"{checks} built stylesheet checks passed.")

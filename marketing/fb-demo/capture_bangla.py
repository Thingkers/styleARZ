#!/usr/bin/env python3
"""Login, inject Bangla UI strings, capture fit-to-screen screenshots."""

from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "shots-bn"
INJECT = (ROOT / "bangla_ui_inject.js").read_text()
BASE = "https://stylearz.com"

PAGES = [
    ("01-home.png", "/", {"width": 1280, "height": 800}, False),
    ("02-shop.png", "/shop", {"width": 1280, "height": 800}, False),
    ("03-admin.png", "/admin", {"width": 1280, "height": 800}, False),
    ("04-inventory.png", "/admin/inventory", {"width": 1280, "height": 800}, False),
    ("05-home-collections.png", "/admin/home", {"width": 1280, "height": 800}, False),
    ("06-pos.png", "/pos", {"width": 1280, "height": 800}, False),
    ("07-pos-solo.png", "/pos", {"width": 1280, "height": 800}, False),  # after clicking solo if possible
    ("08-pos-scan.png", "/pos/scan", {"width": 390, "height": 844}, True),
    ("09-pos-scan-offline.png", "/pos/scan", {"width": 390, "height": 844}, True),
]


def scrub(page):
    page.evaluate(INJECT)
    page.wait_for_timeout(200)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1280, "height": 800},
            device_scale_factor=2,
            locale="bn-BD",
        )
        page = context.new_page()
        page.goto(f"{BASE}/login", wait_until="networkidle", timeout=60000)
        page.fill('input[type="email"], input[name="email"]', "admin@stylearz.com")
        page.fill('input[type="password"]', "style123")
        page.click('button[type="submit"]')
        page.wait_for_timeout(2500)

        for name, path, viewport, mobile in PAGES:
            page.set_viewport_size(viewport)
            page.goto(f"{BASE}{path}", wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(1800)
            if name == "07-pos-solo.png":
                try:
                    page.locator("button", has_text="Solo").first.click(timeout=2500)
                    page.wait_for_timeout(900)
                except Exception:
                    try:
                        page.locator("button", has_text="সোলো").first.click(timeout=1500)
                        page.wait_for_timeout(900)
                    except Exception:
                        pass
            if name == "09-pos-scan-offline.png":
                try:
                    page.locator("button", has_text="Offline").first.click(timeout=2500)
                    page.wait_for_timeout(900)
                except Exception:
                    try:
                        page.locator("button", has_text="অফলাইন").first.click(timeout=1500)
                        page.wait_for_timeout(900)
                    except Exception:
                        pass
            scrub(page)
            # second pass after late-rendered text
            page.wait_for_timeout(400)
            scrub(page)
            dest = OUT / name
            page.screenshot(path=str(dest), full_page=False)
            print("saved", dest)

        browser.close()
    print("done", OUT)


if __name__ == "__main__":
    main()

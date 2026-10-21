#!/usr/bin/env python3
"""Capture EN + BN feature screens with neutral PORTAL branding (no StyleARZ / Thingkers)."""

import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
BASE = "https://stylearz.com"

PAGES = [
    ("10-barcodes.png", "/admin/barcodes", {"width": 1280, "height": 800}, None),
    ("11-pos-sales.png", "/admin/pos-sales", {"width": 1280, "height": 800}, None),
    ("12-products.png", "/admin/products", {"width": 1280, "height": 800}, None),
    ("13-categories.png", "/admin/categories", {"width": 1280, "height": 800}, None),
    ("14-inventory-add.png", "/admin/inventory", {"width": 1280, "height": 800}, "open_add"),
    ("15-inventory-expand.png", "/admin/inventory", {"width": 1280, "height": 800}, "expand_first"),
    ("04-inventory.png", "/admin/inventory", {"width": 1280, "height": 800}, None),
    ("06-pos.png", "/pos", {"width": 1280, "height": 800}, None),
    ("07-pos-solo.png", "/pos", {"width": 1280, "height": 800}, "solo"),
    ("08-pos-scan.png", "/pos/scan", {"width": 390, "height": 844}, None),
    ("09-pos-scan-offline.png", "/pos/scan", {"width": 390, "height": 844}, "offline"),
    ("05-home-collections.png", "/admin/home", {"width": 1280, "height": 800}, None),
    ("03-admin.png", "/admin", {"width": 1280, "height": 800}, None),
    ("02-shop.png", "/shop", {"width": 1280, "height": 800}, None),
    ("01-home.png", "/", {"width": 1280, "height": 800}, None),
]


def act(page, action):
    if not action:
        return
    if action == "solo":
        for label in ("Solo", "সোলো"):
            try:
                page.locator("button", has_text=label).first.click(timeout=2000)
                page.wait_for_timeout(900)
                return
            except Exception:
                continue
    elif action == "offline":
        for label in ("Offline", "অফলাইন"):
            try:
                page.locator("button", has_text=label).first.click(timeout=2000)
                page.wait_for_timeout(900)
                return
            except Exception:
                continue
    elif action == "open_add":
        for label in ("Add", "যোগ", "Add item", "আইটেম যোগ"):
            try:
                page.locator("button", has_text=label).first.click(timeout=2000)
                page.wait_for_timeout(1200)
                return
            except Exception:
                continue
    elif action == "expand_first":
        for label in ("EXPAND", "Expand", "এক্সপ্যান্ড"):
            try:
                page.locator("button", has_text=label).first.click(timeout=2000)
                page.wait_for_timeout(1000)
                return
            except Exception:
                continue


def capture(lang: str) -> None:
    out = ROOT / f"shots-{lang}"
    inject_path = ROOT / ("bangla_ui_inject.js" if lang == "bn" else "english_ui_inject.js")
    inject = inject_path.read_text()
    out.mkdir(parents=True, exist_ok=True)
    locale = "bn-BD" if lang == "bn" else "en-US"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1280, "height": 800},
            device_scale_factor=2,
            locale=locale,
        )
        page = context.new_page()
        page.goto(f"{BASE}/login", wait_until="networkidle", timeout=60000)
        page.fill('input[type="email"]', "admin@stylearz.com")
        page.fill('input[type="password"]', "style123")
        page.click('button[type="submit"]')
        page.wait_for_timeout(2200)

        def scrub():
            page.evaluate(inject)
            page.wait_for_timeout(200)

        for name, path, viewport, action in PAGES:
            page.set_viewport_size(viewport)
            page.goto(f"{BASE}{path}", wait_until="domcontentloaded", timeout=90000)
            page.wait_for_timeout(2200 if path in ("/shop", "/") else 1600)
            if path in ("/shop", "/"):
                try:
                    page.wait_for_load_state("networkidle", timeout=15000)
                except Exception:
                    pass
                page.wait_for_timeout(1200)
            act(page, action)
            scrub()
            page.wait_for_timeout(300)
            scrub()
            dest = out / name
            page.screenshot(path=str(dest), full_page=False)
            print(f"[{lang}] saved", dest.name)

        browser.close()
    print("done", out)


def main() -> None:
    langs = sys.argv[1:] or ["en", "bn"]
    for lang in langs:
        if lang not in ("en", "bn"):
            raise SystemExit(f"unknown lang {lang}")
        capture(lang)


if __name__ == "__main__":
    main()

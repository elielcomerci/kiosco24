from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.goto('https://www.carrefour.com.ar/pure-de-tomate-arcor-brik-520-g-188614/p')
    time.sleep(4)
    html = page.content()
    with open('test_arcor.html', 'w', encoding='utf-8') as f:
        f.write(html)
    browser.close()

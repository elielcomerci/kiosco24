from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.goto('https://www.carrefour.com.ar/tomate-triturado-carrefour-970-cc-22985/p')
    time.sleep(4)
    try:
        page.evaluate("() => { let btn = [...document.querySelectorAll('button')].find(b => b.innerText.toLowerCase().includes('especificaciones')); if(btn) btn.click(); }")
    except Exception as e:
        print(e)
    time.sleep(3)
    html = page.content()
    with open('c:/Users/eliel/kiosco24/test_product.html', 'w', encoding='utf-8') as f:
        f.write(html)
    browser.close()

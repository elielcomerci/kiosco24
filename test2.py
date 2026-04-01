from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.goto('https://www.carrefour.com.ar/tomate-triturado-carrefour-970-cc-22985/p')
    time.sleep(4)
    # The new Carrefour layout might not even require a click to show specs, but let's try
    try:
        page.locator("button:has-text('Especificaciones')").first.click()
    except Exception as e:
        pass
    time.sleep(2)
    props = page.locator(".vtex-product-specifications-1-x-specificationItemProperty").all_inner_texts()
    vals = page.locator(".vtex-product-specifications-1-x-specificationItemValue").all_inner_texts()
    
    print("PROPS:", props)
    print("VALS:", vals)
    browser.close()

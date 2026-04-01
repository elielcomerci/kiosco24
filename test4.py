import re
import time
from playwright.sync_api import sync_playwright

def extract_product_data(page, url):
    page.goto(url, wait_until="domcontentloaded", timeout=60000)
    time.sleep(2)
    ean = ""
    try:
        specs_toggle = page.locator(
            "button:has-text('Especificaciones técnicas'), "
            "button:has-text('Especificaciones'), "
            "[class*='specification'] button, "
            "div:has-text('Especificaciones técnicas')"
        ).last
        if specs_toggle.is_visible(timeout=3000):
            specs_toggle.click()
            time.sleep(1)
    except:
        pass

    try:
        props = page.locator(".vtex-product-specifications-1-x-specificationItemProperty").all_inner_texts()
        vals = page.locator(".vtex-product-specifications-1-x-specificationItemValue").all_inner_texts()
        print("PROPS", props)
        print("VALS", vals)
        if len(props) > 0 and len(props) == len(vals):
            for key_text, val_text in zip(props, vals):
                key = key_text.strip().lower()
                value = val_text.strip()
                if any(k in key for k in ["ean", "código de barras", "codigo de barras", "barcode", "gtin"]):
                    ean = re.sub(r'\D', '', value)
    except:
        pass
    print("FINAL EAN EXTRACTED:", ean)

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    extract_product_data(page, 'https://www.carrefour.com.ar/pure-de-tomate-arcor-brik-520-g-188614/p')
    browser.close()

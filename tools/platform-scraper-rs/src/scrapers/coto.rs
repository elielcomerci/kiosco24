use std::{
    collections::BTreeSet,
    fs,
    sync::Arc,
    thread,
    time::Duration,
};

use anyhow::{bail, Context, Result};
use headless_chrome::{Browser, LaunchOptionsBuilder, Tab};
use rand::Rng;
use regex::Regex;
use scraper::{Html, Selector};

use crate::{
    models::ScrapedProductInput,
    normalize::{normalize_barcode, squeeze_spaces},
};

#[derive(Clone)]
pub struct CotoScraper {
    min_delay_seconds: f64,
    max_delay_seconds: f64,
}

const NAVIGATION_SETTLE_MS: u64 = 4_500;
const CATEGORY_LINK_WAIT_MS: u64 = 22_000;
const PRODUCT_READY_WAIT_MS: u64 = 14_000;
const POLL_INTERVAL_MS: u64 = 1_200;

impl CotoScraper {
    pub fn new(min_delay_seconds: f64, max_delay_seconds: f64) -> Self {
        Self {
            min_delay_seconds,
            max_delay_seconds,
        }
    }

    pub fn scan(
        &self,
        category_url: &str,
        root_url: Option<&str>,
        limit: Option<usize>,
    ) -> Result<Vec<ScrapedProductInput>> {
        let launch_options = LaunchOptionsBuilder::default()
            .headless(true)
            .window_size(Some((1440, 1200)))
            .build()
            .map_err(|error| anyhow::anyhow!("No pude construir las opciones del navegador: {error}"))?;

        let browser = Browser::new(launch_options).context("No pude iniciar Chrome headless.")?;
        let category_tab = browser
            .new_tab()
            .context("No pude abrir la pestana de categoria.")?;
        let product_tab = browser
            .new_tab()
            .context("No pude abrir la pestana de producto.")?;

        if let Some(root_url) = root_url {
            println!("Abriendo inicio: {root_url}");
            self.open_page(&category_tab, root_url)?;
            self.accept_cookie_banner(&category_tab)?;
            self.human_delay();
        }

        println!("Abriendo categoria: {category_url}");
        self.open_page(&category_tab, category_url)?;
        self.accept_cookie_banner(&category_tab)?;
        self.human_delay();

        let mut seen_links = BTreeSet::new();
        let mut products = Vec::new();
        let mut idle_rounds = 0usize;

        loop {
            if limit.is_some_and(|max| products.len() >= max) {
                break;
            }

            let visible_links = self.collect_visible_product_links(&category_tab)?;
            let mut processed_this_round = 0usize;

            for product_url in visible_links {
                if !seen_links.insert(product_url.clone()) {
                    continue;
                }

                processed_this_round += 1;
                match self.extract_product(&product_tab, &product_url) {
                    Ok(Some(product)) => {
                        println!(
                            "  ✓ {} | EAN: {}",
                            product.name,
                            product
                                .barcode
                                .clone()
                                .unwrap_or_else(|| "(sin EAN)".to_string())
                        );
                        products.push(product);
                    }
                    Ok(None) => {
                        println!("  - Se omitio un producto sin nombre valido: {product_url}");
                    }
                    Err(error) => {
                        eprintln!("  x Error en {product_url}: {error}");
                    }
                }

                if limit.is_some_and(|max| products.len() >= max) {
                    break;
                }

                self.human_delay();
            }

            if limit.is_some_and(|max| products.len() >= max) {
                break;
            }

            if processed_this_round == 0 {
                idle_rounds += 1;
            } else {
                idle_rounds = 0;
            }

            let advanced = self.advance_category_listing(&category_tab)?;
            if !advanced && idle_rounds >= 2 {
                break;
            }
        }

        Ok(products)
    }

    fn open_page(&self, tab: &Arc<Tab>, url: &str) -> Result<()> {
        tab.navigate_to(url)
            .with_context(|| format!("No pude navegar a {url}."))?;
        tab.wait_until_navigated()
            .with_context(|| format!("La pagina {url} no termino de cargar."))?;
        thread::sleep(Duration::from_millis(NAVIGATION_SETTLE_MS));
        self.wait_for_document_ready(tab, Duration::from_millis(PRODUCT_READY_WAIT_MS))?;
        Ok(())
    }

    fn collect_visible_product_links(&self, tab: &Arc<Tab>) -> Result<Vec<String>> {
        let selector = Selector::parse("a[href*='/_/R-']").expect("selector valido");
        let mut last_html = String::new();
        let started = std::time::Instant::now();

        while started.elapsed() < Duration::from_millis(CATEGORY_LINK_WAIT_MS) {
            let html = tab
                .get_content()
                .context("No pude leer el HTML de la categoria.")?;

            if self.is_blocked_html(&html) {
                self.dump_debug_html("coto-category-blocked.html", &html);
                bail!(
                    "Coto devolvio una pagina bloqueada por firewall/WAF en vez de la categoria."
                );
            }

            let document = Html::parse_document(&html);
            let mut links = BTreeSet::new();

            for anchor in document.select(&selector) {
                if let Some(href) = anchor.value().attr("href") {
                    if href.contains("/_/R-") {
                        let absolute = if href.starts_with("http") {
                            href.to_string()
                        } else {
                            format!("https://www.cotodigital.com.ar{href}")
                        };
                        let normalized =
                            absolute.split('?').next().unwrap_or(&absolute).to_string();
                        links.insert(normalized);
                    }
                }
            }

            if !links.is_empty() {
                return Ok(links.into_iter().collect());
            }

            last_html = html;
            let _ = tab.evaluate("window.scrollBy(0, Math.max(window.innerHeight, 900));", false);
            thread::sleep(Duration::from_millis(POLL_INTERVAL_MS));
        }

        if !last_html.is_empty() {
            self.dump_debug_html("coto-category-debug.html", &last_html);
        }

        Ok(Vec::new())
    }

    fn advance_category_listing(&self, tab: &Arc<Tab>) -> Result<bool> {
        let before = self.collect_visible_product_links(tab)?.len();

        tab.evaluate("window.scrollTo(0, document.body.scrollHeight);", false)
            .context("No pude hacer scroll en la categoria.")?;
        thread::sleep(Duration::from_millis(2200));
        self.click_first_text_button(
            tab,
            &[
                "mostrar mas",
                "mostrar más",
                "ver mas",
                "ver más",
                "cargar mas",
                "cargar más",
                "ver todos",
                "siguiente",
            ],
        )?;
        thread::sleep(Duration::from_millis(2200));

        let after = self.collect_visible_product_links(tab)?.len();
        Ok(after > before)
    }

    fn extract_product(&self, tab: &Arc<Tab>, product_url: &str) -> Result<Option<ScrapedProductInput>> {
        self.open_page(tab, product_url)?;
        self.accept_cookie_banner(tab)?;
        self.expand_product_sections(tab)?;
        let html = self.wait_for_product_html(tab)?;
        let document = Html::parse_document(&html);

        let name = self
            .extract_first_text(
                &document,
                &[
                    "h1",
                    "[class*='product-name']",
                    "[class*='productName']",
                    "[class*='titulo']",
                    "[class*='title']",
                ],
            )
            .unwrap_or_default();

        if name.trim().is_empty() {
            return Ok(None);
        }

        let brand = self.extract_first_text(
            &document,
            &[
                "[class*='brand']",
                "[class*='marca']",
            ],
        );

        let price_raw = self
            .extract_first_text(
                &document,
                &[
                    "[class*='price']",
                    "[class*='precio']",
                    "[class*='selling']",
                ],
            )
            .map(|value| {
                Regex::new(r"[^\d,.]")
                    .expect("regex valida")
                    .replace_all(&value, "")
                    .to_string()
            });

        let image_source_url = self.extract_first_attr(
            &document,
            &[
                "img[src*='productos']",
                "img[src*='coto']",
                "img",
            ],
            "src",
        );

        let description = self
            .extract_first_text(
                &document,
                &[
                    "[class*='description']",
                    "[class*='descripcion']",
                    "[class*='detalle']",
                ],
            )
            .or_else(|| self.extract_meta_description(&document));

        let page_text = document.root_element().text().collect::<Vec<_>>().join(" ");
        let barcode = normalize_barcode(
            Regex::new(r"(?:EAN|GTIN|Codigo de barras|Código de barras)[^\d]*(\d{8,14})")
                .expect("regex valida")
                .captures(&page_text)
                .and_then(|captures| captures.get(1))
                .map(|value| value.as_str()),
        );

        let presentation = self
            .extract_presentation_from_specs(&document)
            .or_else(|| self.extract_presentation_from_name(&name));

        Ok(Some(ScrapedProductInput {
            barcode,
            name: squeeze_spaces(&name),
            brand: brand.map(|value| squeeze_spaces(&value)),
            category_name: Some("Sin Categoria".to_string()),
            presentation,
            description: description.map(|value| squeeze_spaces(&value)),
            price_raw: price_raw.map(|value| squeeze_spaces(&value)),
            image_source_url,
            image: None,
            source_url: Some(product_url.to_string()),
        }))
    }

    fn wait_for_product_html(&self, tab: &Arc<Tab>) -> Result<String> {
        let started = std::time::Instant::now();
        let mut last_html = String::new();

        while started.elapsed() < Duration::from_millis(PRODUCT_READY_WAIT_MS) {
            let html = tab.get_content().context("No pude leer el HTML del producto.")?;
            if self.is_blocked_html(&html) {
                self.dump_debug_html("coto-product-blocked.html", &html);
                bail!("Coto bloqueo la navegacion al detalle del producto.");
            }

            let document = Html::parse_document(&html);
            let has_name = self
                .extract_first_text(
                    &document,
                    &[
                        "h1",
                        "[class*='product-name']",
                        "[class*='productName']",
                        "[class*='titulo']",
                        "[class*='title']",
                    ],
                )
                .is_some();
            let has_product_image = self
                .extract_first_attr(
                    &document,
                    &["img[src*='productos']", "img[src*='coto']", "img"],
                    "src",
                )
                .is_some();

            if has_name || has_product_image {
                return Ok(html);
            }

            last_html = html;
            thread::sleep(Duration::from_millis(POLL_INTERVAL_MS));
        }

        if !last_html.is_empty() {
            self.dump_debug_html("coto-product-debug.html", &last_html);
        }

        Ok(last_html)
    }

    fn expand_product_sections(&self, tab: &Arc<Tab>) -> Result<()> {
        self.click_first_text_button(
            tab,
            &[
                "especificaciones tecnicas",
                "especificaciones técnicas",
                "especificaciones",
                "informacion nutricional",
                "información nutricional",
                "detalle del producto",
                "descripcion",
                "descripción",
            ],
        )?;
        Ok(())
    }

    fn accept_cookie_banner(&self, tab: &Arc<Tab>) -> Result<()> {
        self.click_first_text_button(
            tab,
            &[
                "aceptar",
                "aceptar todo",
                "aceptar y continuar",
                "continuar",
                "entendido",
            ],
        )?;
        Ok(())
    }

    fn click_first_text_button(&self, tab: &Arc<Tab>, labels: &[&str]) -> Result<()> {
        let labels_json = serde_json::to_string(labels)?;
        let script = format!(
            r#"
            (() => {{
              const labels = {labels_json}.map((value) => value.toLowerCase());
              const candidates = Array.from(document.querySelectorAll("button, [role='button'], a"));
              for (const candidate of candidates) {{
                const text = (candidate.innerText || candidate.textContent || "").trim().toLowerCase();
                if (!text) continue;
                if (labels.some((label) => text.includes(label))) {{
                  candidate.click();
                  return true;
                }}
              }}
              return false;
            }})()
            "#
        );
        let _ = tab.evaluate(&script, false);
        Ok(())
    }

    fn wait_for_document_ready(&self, tab: &Arc<Tab>, timeout: Duration) -> Result<()> {
        let started = std::time::Instant::now();
        while started.elapsed() < timeout {
            if let Ok(result) = tab.evaluate("document.readyState", true) {
                if let Some(value) = result.value {
                    if value.as_str() == Some("complete") || value.as_str() == Some("interactive")
                    {
                        return Ok(());
                    }
                }
            }
            thread::sleep(Duration::from_millis(350));
        }
        Ok(())
    }

    fn is_blocked_html(&self, html: &str) -> bool {
        let normalized = html.to_lowercase();
        normalized.contains("web page blocked")
            || normalized.contains("the url you requested has been blocked")
            || normalized.contains("attack id:")
            || normalized.contains("message id:")
    }

    fn dump_debug_html(&self, file_name: &str, html: &str) {
        let output_dir = "output";
        let _ = fs::create_dir_all(output_dir);
        let _ = fs::write(format!("{output_dir}/{file_name}"), html);
    }

    fn extract_first_text(&self, document: &Html, selectors: &[&str]) -> Option<String> {
        for selector_text in selectors {
            let selector = Selector::parse(selector_text).ok()?;
            if let Some(element) = document.select(&selector).next() {
                let text = squeeze_spaces(&element.text().collect::<Vec<_>>().join(" "));
                if !text.is_empty() {
                    return Some(text);
                }
            }
        }
        None
    }

    fn extract_first_attr(&self, document: &Html, selectors: &[&str], attr: &str) -> Option<String> {
        for selector_text in selectors {
            let selector = Selector::parse(selector_text).ok()?;
            if let Some(element) = document.select(&selector).next() {
                if let Some(value) = element.value().attr(attr) {
                    let value = value.trim().to_string();
                    if !value.is_empty() {
                        return Some(value);
                    }
                }
            }
        }
        None
    }

    fn extract_meta_description(&self, document: &Html) -> Option<String> {
        self.extract_first_attr(document, &["meta[name='description']"], "content")
            .map(|value| value.chars().take(500).collect())
    }

    fn extract_presentation_from_specs(&self, document: &Html) -> Option<String> {
        let rows_selector = Selector::parse("table tr").ok()?;
        let cell_selector = Selector::parse("td, th").ok()?;

        for row in document.select(&rows_selector) {
            let cells: Vec<String> = row
                .select(&cell_selector)
                .map(|cell| squeeze_spaces(&cell.text().collect::<Vec<_>>().join(" ")))
                .collect();

            if cells.len() < 2 {
                continue;
            }

            let key = cells[0].to_lowercase();
            if [
                "contenido neto",
                "presentacion",
                "presentación",
                "peso neto",
                "volumen",
                "unidad de venta",
            ]
            .iter()
            .any(|candidate| key.contains(candidate))
            {
                return Some(cells[1].clone());
            }
        }

        None
    }

    fn extract_presentation_from_name(&self, name: &str) -> Option<String> {
        Regex::new(r"(\d+[\.,]?\d*\s*(g|gr|kg|ml|l|lt|cc))\b")
            .expect("regex valida")
            .captures(name)
            .and_then(|captures| captures.get(1))
            .map(|value| value.as_str().to_string())
    }

    fn human_delay(&self) {
        let seconds = rand::rng().random_range(self.min_delay_seconds..=self.max_delay_seconds);
        thread::sleep(Duration::from_secs_f64(seconds));
    }
}

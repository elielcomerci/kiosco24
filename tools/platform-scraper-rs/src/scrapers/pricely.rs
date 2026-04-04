use std::{
    collections::BTreeSet,
    sync::Arc,
    thread,
    time::Duration,
};

use anyhow::{bail, Context, Result};
use headless_chrome::{Browser, LaunchOptionsBuilder, Tab};
use rand::Rng;
use regex::Regex;
use serde::Deserialize;

use crate::{
    models::ScrapedProductInput,
    normalize::{normalize_barcode, normalize_optional_title, normalize_source_url, normalize_title},
};

const NAVIGATION_SETTLE_MS: u64 = 1_400;
const PAGE_READY_WAIT_MS: u64 = 10_000;
const POLL_INTERVAL_MS: u64 = 350;

#[derive(Clone)]
pub struct PricelyScraper {
    min_delay_seconds: f64,
    max_delay_seconds: f64,
}

#[derive(Debug, Deserialize)]
struct PricelyExtractedProduct {
    #[serde(rename = "sourceUrl")]
    source_url: String,
    barcode: Option<String>,
    name: Option<String>,
    #[serde(rename = "priceRaw")]
    price_raw: Option<String>,
    #[serde(rename = "imageSourceUrl")]
    image_source_url: Option<String>,
    #[serde(rename = "categoryName")]
    category_name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PricelyExtractedPage {
    #[serde(rename = "pageUrl")]
    page_url: String,
    #[serde(rename = "nextPageUrl")]
    next_page_url: Option<String>,
    #[serde(rename = "categoryName")]
    category_name: Option<String>,
    products: Vec<PricelyExtractedProduct>,
}

impl PricelyScraper {
    pub fn new(min_delay_seconds: f64, max_delay_seconds: f64) -> Self {
        Self {
            min_delay_seconds,
            max_delay_seconds,
        }
    }

    pub fn scan_with_handler<F>(
        &self,
        category_url: &str,
        root_url: Option<&str>,
        limit: Option<usize>,
        mut on_product: F,
    ) -> Result<usize>
    where
        F: FnMut(ScrapedProductInput) -> Result<()>,
    {
        let launch_options = LaunchOptionsBuilder::default()
            .headless(true)
            .window_size(Some((1440, 1200)))
            .build()
            .map_err(|error| anyhow::anyhow!("No pude construir las opciones del navegador: {error}"))?;

        let browser = Browser::new(launch_options).context("No pude iniciar Chrome headless.")?;
        let tab = browser
            .new_tab()
            .context("No pude abrir la pestana de Pricely.")?;

        let mut next_page_url = self.resolve_url(category_url, root_url);
        let mut seen_product_urls = BTreeSet::new();
        let mut visited_pages = BTreeSet::new();
        let mut processed_products = 0usize;

        while let Some(page_url) = next_page_url.clone() {
            if !visited_pages.insert(page_url.clone()) {
                break;
            }

            if limit.is_some_and(|max| processed_products >= max) {
                break;
            }

            println!("Pagina Pricely -> {page_url}");
            self.open_page(&tab, &page_url)?;
            self.human_delay();

            let extracted = self.extract_page(&tab)?;
            let page_category_name = extracted.category_name.clone();

            if extracted.products.is_empty() && processed_products == 0 {
                bail!("Pricely no devolvio productos en la categoria solicitada.");
            }

            for raw_product in extracted.products {
                if limit.is_some_and(|max| processed_products >= max) {
                    break;
                }

                let Some(source_url) = normalize_source_url(Some(&raw_product.source_url)) else {
                    continue;
                };
                if !seen_product_urls.insert(source_url.clone()) {
                    continue;
                }

                let barcode = normalize_barcode(raw_product.barcode.as_deref()).or_else(|| {
                    Self::barcode_from_product_url(&source_url)
                });

                let name = raw_product
                    .name
                    .as_deref()
                    .map(normalize_title)
                    .filter(|value| !value.is_empty());
                let Some(name) = name else {
                    continue;
                };

                let product = ScrapedProductInput {
                    barcode,
                    name: name.clone(),
                    brand: None,
                    category_name: raw_product
                        .category_name
                        .as_deref()
                        .and_then(|value| normalize_optional_title(Some(value)))
                        .or_else(|| {
                            page_category_name
                                .as_deref()
                                .and_then(|value| normalize_optional_title(Some(value)))
                        }),
                    presentation: Self::extract_presentation_from_name(&name),
                    description: None,
                    price_raw: raw_product
                        .price_raw
                        .as_deref()
                        .and_then(|value| normalize_optional_title(Some(value))),
                    image_source_url: raw_product
                        .image_source_url
                        .as_deref()
                        .and_then(|value| normalize_source_url(Some(value))),
                    image: None,
                    source_url: Some(source_url),
                };

                on_product(product)?;
                processed_products += 1;
            }

            next_page_url = extracted
                .next_page_url
                .as_deref()
                .and_then(|value| normalize_source_url(Some(value)));

            if next_page_url.as_deref() == Some(extracted.page_url.as_str()) {
                break;
            }
        }

        Ok(processed_products)
    }

    fn resolve_url(&self, candidate: &str, root_url: Option<&str>) -> Option<String> {
        let trimmed = candidate.trim();
        if trimmed.is_empty() {
            return None;
        }

        if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
            return Some(trimmed.to_string());
        }

        root_url.map(|root| {
            let normalized_root = root.trim_end_matches('/');
            let normalized_candidate = trimmed.trim_start_matches('/');
            format!("{normalized_root}/{normalized_candidate}")
        })
    }

    fn open_page(&self, tab: &Arc<Tab>, url: &str) -> Result<()> {
        tab.navigate_to(url)
            .with_context(|| format!("No pude navegar a {url}."))?;
        tab.wait_until_navigated()
            .with_context(|| format!("La pagina {url} no termino de cargar."))?;
        thread::sleep(Duration::from_millis(NAVIGATION_SETTLE_MS));
        self.wait_for_document_ready(tab, Duration::from_millis(PAGE_READY_WAIT_MS))?;
        Ok(())
    }

    fn extract_page(&self, tab: &Arc<Tab>) -> Result<PricelyExtractedPage> {
        let result = tab
            .evaluate(
                r#"
                (() => {
                  const normalizeText = (value) => (value || "").replace(/\s+/g, " ").trim();
                  const cleanName = (value) => normalizeText(value)
                    .replace(/\$\s*[\d\.\,\s]+.*$/i, "")
                    .replace(/\shace\s+\d+.*$/i, "")
                    .trim();

                  const heading = normalizeText(
                    document.querySelector("main h1")?.textContent ||
                    document.querySelector("h1")?.textContent ||
                    ""
                  ) || null;

                  const seen = new Set();
                  const products = [];

                  for (const anchor of Array.from(document.querySelectorAll('a[href*="/product/"]'))) {
                    const href = anchor.getAttribute("href") || "";
                    const match = href.match(/\/product\/(\d{8,14})(?:\/|$|\?)/);
                    if (!match) continue;

                    const absoluteUrl = new URL(href, window.location.origin).toString();
                    if (seen.has(absoluteUrl)) continue;
                    seen.add(absoluteUrl);

                    let container = anchor;
                    let cursor = anchor;
                    while (cursor && cursor !== document.body) {
                      const text = normalizeText(cursor.textContent || "");
                      if (/\$\s*[\d\.\,\s]+/.test(text) || cursor.querySelector("img")) {
                        container = cursor;
                        break;
                      }
                      cursor = cursor.parentElement;
                    }

                    const image = container.querySelector("img") || anchor.querySelector("img");
                    const imageAlt = cleanName(image?.getAttribute("alt") || "");
                    const anchorName = cleanName(anchor.textContent || "");
                    const containerText = normalizeText(container.textContent || "");
                    const priceMatch = containerText.match(/\$\s*[\d\.\,\s]+/);

                    let imageSourceUrl =
                      image?.getAttribute("src") ||
                      image?.getAttribute("data-src") ||
                      null;

                    if (!imageSourceUrl) {
                      const srcset = image?.getAttribute("srcset") || "";
                      imageSourceUrl = srcset.split(",")[0]?.trim().split(" ")[0] || null;
                    }

                    const name = imageAlt || anchorName || null;
                    if (!name) continue;

                    products.push({
                      sourceUrl: absoluteUrl,
                      barcode: match[1],
                      name,
                      priceRaw: priceMatch ? normalizeText(priceMatch[0]) : null,
                      imageSourceUrl: imageSourceUrl ? new URL(imageSourceUrl, window.location.origin).toString() : null,
                      categoryName: heading,
                    });
                  }

                  const nextAnchor = Array.from(document.querySelectorAll("a[href]")).find((item) =>
                    /siguiente/i.test(normalizeText(item.textContent || ""))
                  );

                  return {
                    pageUrl: window.location.href,
                    nextPageUrl: nextAnchor ? new URL(nextAnchor.getAttribute("href"), window.location.origin).toString() : null,
                    categoryName: heading,
                    products,
                  };
                })()
                "#,
                true,
            )
            .context("No pude extraer los productos visibles desde Pricely.")?;

        let value = result
            .value
            .context("Pricely no devolvio una respuesta util desde el navegador.")?;

        serde_json::from_value(value).context("No pude interpretar el payload extraido de Pricely.")
    }

    fn wait_for_document_ready(&self, tab: &Arc<Tab>, timeout: Duration) -> Result<()> {
        let started = std::time::Instant::now();
        while started.elapsed() < timeout {
            if let Ok(result) = tab.evaluate("document.readyState", true) {
                if let Some(value) = result.value {
                    if value.as_str() == Some("complete") || value.as_str() == Some("interactive") {
                        return Ok(());
                    }
                }
            }
            thread::sleep(Duration::from_millis(POLL_INTERVAL_MS));
        }
        Ok(())
    }

    fn human_delay(&self) {
        let min = self.min_delay_seconds.min(self.max_delay_seconds);
        let max = self.max_delay_seconds.max(self.min_delay_seconds);
        let delay = if (max - min).abs() < f64::EPSILON {
            min
        } else {
            rand::rng().random_range(min..=max)
        };
        thread::sleep(Duration::from_secs_f64(delay));
    }

    fn barcode_from_product_url(url: &str) -> Option<String> {
        let regex = Regex::new(r"/product/(\d{8,14})(?:/|$|\?)").expect("regex valida");
        regex
            .captures(url)
            .and_then(|captures| captures.get(1).map(|value| value.as_str().to_string()))
            .and_then(|value| normalize_barcode(Some(&value)))
    }

    fn extract_presentation_from_name(name: &str) -> Option<String> {
        let patterns = [
            r"(?i)\b(\d+(?:[.,]\d+)?\s?(?:ml|cc|cl|g|gr|kg|lt|lts|l|u|un|un\.|uds?|m|mts|paños))\b",
            r"(?i)\b(pack\s*x\s*\d+)\b",
            r"(?i)\b(x\s*\d+\s?(?:u|un|uds?))\b",
        ];

        for pattern in patterns {
            let regex = Regex::new(pattern).expect("regex valida");
            if let Some(captures) = regex.captures(name) {
                if let Some(value) = captures.get(1) {
                    let normalized = normalize_title(value.as_str());
                    if !normalized.is_empty() {
                        return Some(normalized);
                    }
                }
            }
        }

        None
    }
}

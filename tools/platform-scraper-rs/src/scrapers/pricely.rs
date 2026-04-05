use std::{collections::BTreeSet, thread, time::Duration};

use anyhow::{bail, Context, Result};
use rand::Rng;
use regex::Regex;
use reqwest::Url;
use scraper::{Html, Selector};
use serde::Deserialize;
use ureq::Agent;

use crate::{
    models::{ScanPageProgress, ScanResumePosition, ScrapedProductInput},
    normalize::{normalize_barcode, normalize_optional_title, normalize_source_url, normalize_title},
};

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
        resume_from: Option<ScanResumePosition>,
        mut on_page_complete: impl FnMut(ScanPageProgress) -> Result<()>,
        mut on_product: F,
    ) -> Result<usize>
    where
        F: FnMut(ScrapedProductInput) -> Result<()>,
    {
        let agent = Self::build_client()?;

        let base_url = self
            .resolve_url(category_url, root_url)
            .and_then(|url| Self::normalize_pagination_url(&url))
            .ok_or_else(|| anyhow::anyhow!("No se pudo resolver la URL de la categoria."))?;
        let mut seen_product_urls = BTreeSet::new();
        let mut processed_products = 0usize;
        let mut empty_pages = 0usize;
        const MAX_CONSECUTIVE_EMPTY_PAGES: usize = 3;

        let start_page = resume_from
            .as_ref()
            .map(|pos| pos.next_page_number)
            .unwrap_or(1);

        if let Some(resume) = resume_from {
            let normalized_resume = Self::normalize_pagination_url(&resume.category_url)
                .unwrap_or_else(|| resume.category_url.clone());
            let normalized_base = base_url.as_str();
            if !Self::urls_match_base(&normalized_resume, normalized_base) {
                bail!(
                    "La URL de resume no coincide con la URL base: {} vs {}",
                    resume.category_url,
                    base_url
                );
            }
            println!(
                "Retomando desde pagina {} de {}",
                start_page, base_url
            );
        }

        let mut page_number = start_page;
        let mut page_category_name: Option<String> = None;

        while let Some(page_url) = Self::build_page_url(&base_url, page_number) {
            if limit.is_some_and(|max| processed_products >= max) {
                break;
            }

            println!("Pagina Pricely -> {page_url}");
            let html = Self::fetch_page(&agent, &page_url)?;

            // Detect server error page (Pricely shows "Error del servidor" / "Categoría no encontrada")
            if html.contains("Error del servidor")
                || html.contains("Categoría no encontrada")
                || html.contains("<title>404")
            {
                println!("  Pagina de error detectada. Fin del escaneo.");
                break;
            }

            let extracted = Self::extract_page_from_html(&html, &page_url)?;

            if let Some(cat) = extracted.category_name.clone() {
                page_category_name = Some(cat);
            }

            let products_count = extracted.products.len();

            if products_count == 0 {
                empty_pages += 1;
                if empty_pages >= MAX_CONSECUTIVE_EMPTY_PAGES {
                    println!(
                        "Fin del escaneo: {} paginas consecutivas sin productos.",
                        MAX_CONSECUTIVE_EMPTY_PAGES
                    );
                    break;
                }
                page_number += 1;
                self.human_delay();
                continue;
            }

            empty_pages = 0;

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

            on_page_complete(ScanPageProgress {
                category_url: base_url.clone(),
                page_url: page_url.clone(),
                page_number,
            })?;

            page_number += 1;
            self.human_delay();
        }

        Ok(processed_products)
    }

    fn build_client() -> Result<Agent> {
        ureq::Agent::config_builder()
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
            .build()
            .try_into()
            .context("No pude construir el agente HTTP.")
    }

    fn fetch_page(agent: &Agent, url: &str) -> Result<String> {
        let parsed = Url::parse(url).ok();
        let origin = parsed
            .as_ref()
            .map(|u| format!("{}://{}", u.scheme(), u.host_str().unwrap_or("")))
            .unwrap_or_default();

        let mut req = agent.get(url);
        req = req.header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7");
        req = req.header("Accept-Encoding", "gzip, deflate, br, zstd");
        req = req.header("Accept-Language", "es-AR,es;q=0.9,en;q=0.8,pt;q=0.7");
        req = req.header("Cache-Control", "no-cache");
        req = req.header("Connection", "keep-alive");
        req = req.header("DNT", "1");
        req = req.header("Pragma", "no-cache");
        req = req.header("Sec-Fetch-Dest", "document");
        req = req.header("Sec-Fetch-Mode", "navigate");
        req = req.header("Sec-Fetch-Site", "none");
        req = req.header("Sec-Fetch-User", "?1");
        req = req.header("Upgrade-Insecure-Requests", "1");
        if !origin.is_empty() {
            req = req.header("Sec-Ch-Ua", "\"Not-A.Brand\";v=\"99\", \"Chromium\";v=\"124\"");
            req = req.header("Sec-Ch-Ua-Mobile", "?0");
            req = req.header("Sec-Ch-Ua-Platform", "\"Windows\"");
            req = req.header("Origin", &origin);
            req = req.header("Referer", &origin);
        }

        let response = req
            .call()
            .with_context(|| format!("No pude hacer la peticion a {url}."))?;
        let status = response.status();
        if !status.is_success() {
            bail!("La pagina {url} respondio con estado {status}.");
        }

        response
            .into_body()
            .read_to_string()
            .with_context(|| format!("No pude leer el contenido de {url}."))
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

    fn extract_page_from_html(rendered_html: &str, page_url: &str) -> Result<PricelyExtractedPage> {
        let document = Html::parse_document(rendered_html);
        let product_selector =
            Selector::parse(r#"a[href*="/product/"]"#).expect("selector valido");
        let image_selector = Selector::parse("img").expect("selector valido");
        let heading_selector =
            Selector::parse("main h1, h1, title").expect("selector valido");
        let pagination_selector = Selector::parse("a[href]").expect("selector valido");

        let category_name = document
            .select(&heading_selector)
            .map(|element| element.text().collect::<Vec<_>>().join(" "))
            .map(|text| Self::normalize_browser_text(&text))
            .find(|text| !text.is_empty());

        let mut seen = BTreeSet::new();
        let mut products = Vec::new();

        for anchor in document.select(&product_selector) {
            let Some(href) = anchor.value().attr("href") else {
                continue;
            };

            let Some(absolute_url) = Self::join_url(page_url, href) else {
                continue;
            };

            if !seen.insert(absolute_url.clone()) {
                continue;
            }

            let barcode = Self::barcode_from_product_url(&absolute_url);
            let name = anchor
                .select(&image_selector)
                .filter_map(|image| image.value().attr("alt"))
                .map(Self::clean_name)
                .find(|value| !value.is_empty())
                .or_else(|| {
                    let text = anchor.text().collect::<Vec<_>>().join(" ");
                    let cleaned = Self::clean_name(&text);
                    (!cleaned.is_empty()).then_some(cleaned)
                });

            let Some(name) = name else {
                continue;
            };

            let image_source_url = anchor
                .select(&image_selector)
                .find_map(|image| Self::extract_image_source_from_html(page_url, &image));

            let price_raw = Self::extract_price_from_fragment(&anchor.html());

            products.push(PricelyExtractedProduct {
                source_url: absolute_url,
                barcode,
                name: Some(name),
                price_raw,
                image_source_url,
                category_name: category_name.clone(),
            });
        }

        let _next_page_url = document
            .select(&pagination_selector)
            .find_map(|anchor| {
                let text = anchor.text().collect::<Vec<_>>().join(" ");
                let normalized = Self::normalize_browser_text(&text);
                if !normalized.to_lowercase().contains("siguiente") {
                    return None;
                }

                anchor
                    .value()
                    .attr("href")
                    .and_then(|href| Self::join_url(page_url, href))
            });

        Ok(PricelyExtractedPage {
            category_name,
            products,
        })
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

    fn normalize_browser_text(value: &str) -> String {
        value.split_whitespace().collect::<Vec<_>>().join(" ")
    }

    fn clean_name(value: &str) -> String {
        let normalized = Self::normalize_browser_text(value);
        let price_regex =
            Regex::new(r"\$\s*[\d\.\,\s]+.*$").expect("regex valida");
        let relative_time_regex =
            Regex::new(r"(?i)\shace\s+\d+.*$").expect("regex valida");

        let without_price = price_regex.replace(&normalized, "");
        let without_relative_time = relative_time_regex.replace(&without_price, "");
        without_relative_time.trim().to_string()
    }

    fn join_url(base_url: &str, candidate: &str) -> Option<String> {
        let trimmed = candidate.trim();
        if trimmed.is_empty() {
            return None;
        }

        if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
            return Some(trimmed.to_string());
        }

        Url::parse(base_url)
            .ok()
            .and_then(|base| base.join(trimmed).ok())
            .map(|url| url.to_string())
    }

    fn extract_image_source_from_html(
        page_url: &str,
        image: &scraper::ElementRef<'_>,
    ) -> Option<String> {
        let raw_source = image
            .value()
            .attr("src")
            .or_else(|| image.value().attr("data-src"))
            .map(str::to_string)
            .or_else(|| {
                image
                    .value()
                    .attr("srcset")
                    .and_then(|srcset| srcset.split(',').next())
                    .map(|entry| entry.trim().split(' ').next().unwrap_or_default().to_string())
            })?;

        Self::join_url(page_url, &raw_source)
    }

    fn extract_price_from_fragment(fragment: &str) -> Option<String> {
        let price_regex = Regex::new(r"\$\s*[\d\.\,\s]+").expect("regex valida");
        price_regex
            .find(fragment)
            .map(|matched| Self::normalize_browser_text(matched.as_str()))
    }

    fn urls_match_base(candidate: &str, base: &str) -> bool {
        let parse_base_url = |url: &str| {
            Url::parse(url).ok().map(|parsed| {
                let path = parsed.path().to_string();
                let params: BTreeSet<_> = parsed
                    .query_pairs()
                    .filter(|(k, _)| k != "p")
                    .map(|(k, v)| (k.into_owned(), v.into_owned()))
                    .collect();
                (path, params)
            })
        };

        match (parse_base_url(candidate), parse_base_url(base)) {
            (Some((c_path, c_params)), Some((b_path, b_params))) => {
                c_path == b_path && c_params == b_params
            }
            _ => candidate == base,
        }
    }

    fn build_page_url(base_url: &str, page: usize) -> Option<String> {
        let parsed = Url::parse(base_url).ok()?;
        let mut pairs: Vec<(String, String)> = parsed
            .query_pairs()
            .map(|(k, v)| (k.into_owned(), v.into_owned()))
            .collect();

        let had_p = pairs.iter().any(|(k, _)| k == "p");
        if had_p {
            for (k, v) in pairs.iter_mut() {
                if k == "p" {
                    *v = page.to_string();
                    break;
                }
            }
        } else {
            pairs.push(("p".to_string(), page.to_string()));
        }

        let path = parsed.path().to_string();
        let mut url = format!("{}://{}{}", parsed.scheme(), parsed.host_str()?, path);
        if let Some(port) = parsed.port() {
            url = format!("{}:{}", url, port);
        }
        if !pairs.is_empty() {
            url.push('?');
            for (i, (k, v)) in pairs.iter().enumerate() {
                if i > 0 {
                    url.push('&');
                }
                url.push_str(k);
                url.push('=');
                url.push_str(v);
            }
        }

        Some(url)
    }

    fn normalize_pagination_url(value: &str) -> Option<String> {
        let normalized = value
            .trim()
            .split('#')
            .next()
            .unwrap_or(value)
            .trim_end_matches('/')
            .trim();

        if normalized.is_empty() {
            None
        } else {
            Some(normalized.to_string())
        }
    }
}

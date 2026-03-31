use std::{
    collections::{BTreeSet, VecDeque},
    io::{self, Write},
    sync::Arc,
    thread,
    time::{Duration, Instant},
};

use anyhow::{Context, Result};
use headless_chrome::{Browser, LaunchOptionsBuilder, Tab};
use rand::Rng;
use regex::Regex;
use scraper::{Html, Selector};

use crate::{
    models::{ScanPageProgress, ScanResumePosition, ScrapedProductInput},
    normalize::{normalize_barcode, squeeze_spaces},
};

const CARREFOUR_BASE_URL: &str = "https://www.carrefour.com.ar";
const NAVIGATION_SETTLE_MS: u64 = 2_400;
const PRODUCT_GRID_WAIT_MS: u64 = 12_000;
const PRODUCT_READY_WAIT_MS: u64 = 10_000;
const POLL_INTERVAL_MS: u64 = 900;
const KNOWN_CARREFOUR_TOP_CATEGORIES: &[(&str, &str)] = &[
    ("https://www.carrefour.com.ar/almacen", "Almacen"),
    ("https://www.carrefour.com.ar/bebidas", "Bebidas"),
    ("https://www.carrefour.com.ar/desayuno-y-merienda", "Desayuno y Merienda"),
    ("https://www.carrefour.com.ar/lacteos-y-productos-frescos", "Lacteos y Productos Frescos"),
    ("https://www.carrefour.com.ar/congelados", "Congelados"),
    ("https://www.carrefour.com.ar/limpieza", "Limpieza"),
    ("https://www.carrefour.com.ar/perfumeria-y-farmacia", "Perfumeria y Farmacia"),
];

#[derive(Clone)]
pub struct CarrefourScraper {
    min_delay_seconds: f64,
    max_delay_seconds: f64,
}

#[derive(Clone, Debug)]
struct CategoryCandidate {
    url: String,
    label: Option<String>,
}

#[derive(Debug, Clone, Copy)]
struct LoadedCategoryPageOutcome {
    new_links_total: usize,
    completed: bool,
}

impl CategoryCandidate {
    fn new(url: String, label: Option<String>) -> Self {
        Self { url, label }
    }
}

impl CarrefourScraper {
    pub fn new(min_delay_seconds: f64, max_delay_seconds: f64) -> Self {
        Self {
            min_delay_seconds,
            max_delay_seconds,
        }
    }

    #[allow(dead_code)]
    pub fn scan(
        &self,
        category_url: &str,
        root_url: Option<&str>,
        limit: Option<usize>,
        discover_categories: bool,
        max_categories: Option<usize>,
    ) -> Result<Vec<ScrapedProductInput>> {
        let mut products = Vec::new();
        self.scan_with_handler(
            category_url,
            root_url,
            limit,
            discover_categories,
            max_categories,
            None,
            |_| Ok(()),
            |product| {
                products.push(product);
                Ok(())
            },
        )?;
        Ok(products)
    }

    pub fn scan_with_handler<F>(
        &self,
        category_url: &str,
        root_url: Option<&str>,
        limit: Option<usize>,
        discover_categories: bool,
        max_categories: Option<usize>,
        resume_from: Option<ScanResumePosition>,
        mut on_page_complete: impl FnMut(ScanPageProgress) -> Result<()>,
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
        let category_tab = browser
            .new_tab()
            .context("No pude abrir la pestana de categoria.")?;
        let product_tab = browser
            .new_tab()
            .context("No pude abrir la pestana de producto.")?;

        if let Some(root_url) = root_url {
            print_line(format!("Abriendo inicio: {root_url}"));
            self.open_page(&category_tab, root_url)?;
            self.accept_cookie_banner(&category_tab)?;
            self.human_delay();
        }

        let categories = if discover_categories {
            self.discover_categories(&category_tab, category_url, root_url, max_categories)?
        } else {
            vec![CategoryCandidate::new(category_url.to_string(), None)]
        };

        print_line(format!("Categorias a recorrer: {}", categories.len()));

        let resume_target = resume_from.as_ref().map(|state| {
            (
                self.normalize_category_url(&state.category_url),
                state.next_page_number,
            )
        });
        let resume_index = resume_target.as_ref().and_then(|(category_url, _)| {
            categories
                .iter()
                .position(|category| self.normalize_category_url(&category.url) == *category_url)
        });

        if resume_target.is_some() && resume_index.is_none() {
            let missing = &resume_target
                .as_ref()
                .map(|(category_url, _)| category_url.clone())
                .unwrap_or_default();
            anyhow::bail!(
                "No pude ubicar la categoria del checkpoint para retomar: {}",
                missing
            );
        }

        let mut seen_links = BTreeSet::new();
        let mut processed_products = 0usize;

        for (index, category) in categories.iter().enumerate() {
            if limit.is_some_and(|max| processed_products >= max) {
                break;
            }

            if resume_index.is_some_and(|resume_at| index < resume_at) {
                print_line(format!(
                    "Categoria {}/{}: {} (omitida por resume)",
                    index + 1,
                    categories.len(),
                    category.url
                ));
                continue;
            }

            let start_page_number = if resume_index == Some(index) {
                let next_page = resume_target
                    .as_ref()
                    .map(|(_, page_number)| *page_number)
                    .unwrap_or(1);
                print_line(format!(
                    "Categoria {}/{}: {} (retomando desde pagina {})",
                    index + 1,
                    categories.len(),
                    category.url,
                    next_page
                ));
                next_page
            } else {
                print_line(format!(
                    "Categoria {}/{}: {}",
                    index + 1,
                    categories.len(),
                    category.url
                ));
                self.extract_page_number(&category.url).unwrap_or(1)
            };

            self.scan_category_pages(
                &category.url,
                &category_tab,
                &product_tab,
                category.label.clone(),
                start_page_number,
                limit,
                &mut seen_links,
                &mut processed_products,
                &mut on_page_complete,
                &mut on_product,
            )?;
        }

        Ok(processed_products)
    }

    fn discover_categories(
        &self,
        tab: &Arc<Tab>,
        seed_url: &str,
        root_url: Option<&str>,
        max_categories: Option<usize>,
    ) -> Result<Vec<CategoryCandidate>> {
        if self.is_carrefour_home(seed_url) {
            let mut curated: Vec<CategoryCandidate> = KNOWN_CARREFOUR_TOP_CATEGORIES
                .iter()
                .map(|(url, label)| CategoryCandidate::new((*url).to_string(), Some((*label).to_string())))
                .collect();
            if let Some(max) = max_categories {
                curated.truncate(max);
            }
            return Ok(curated);
        }

        let discovery_root = root_url.unwrap_or(CARREFOUR_BASE_URL);
        let mut queue = VecDeque::from([CategoryCandidate::new(seed_url.to_string(), None)]);
        let mut visited = BTreeSet::new();
        let mut discovered = Vec::new();
        let mut discovered_urls = BTreeSet::new();

        while let Some(candidate) = queue.pop_front() {
            let normalized = self.normalize_category_url(&candidate.url);
            if !visited.insert(normalized.clone()) {
                continue;
            }

            print_line(format!("Explorando posible categoria: {}", candidate.url));
            self.open_page(tab, &candidate.url)?;
            self.accept_cookie_banner(tab)?;

            let product_links = self.collect_visible_product_links(tab)?;
            let page_label = self.extract_category_name_from_category_page(tab)?;

            if !product_links.is_empty() && discovered_urls.insert(normalized.clone()) {
                discovered.push(CategoryCandidate::new(
                    normalized.clone(),
                    page_label.clone().or(candidate.label.clone()),
                ));
                if max_categories.is_some_and(|max| discovered.len() >= max.saturating_mul(3).max(max)) {
                    break;
                }
            }

            for nested in self.collect_category_candidates(tab, discovery_root)? {
                let nested_normalized = self.normalize_category_url(&nested.url);
                if visited.contains(&nested_normalized)
                    || discovered_urls.contains(&nested_normalized)
                    || queue.iter().any(|item| self.normalize_category_url(&item.url) == nested_normalized)
                {
                    continue;
                }
                queue.push_back(CategoryCandidate::new(
                    nested_normalized,
                    nested.label.or_else(|| page_label.clone()),
                ));
            }
        }

        Ok(self.prioritize_categories(discovered, seed_url, max_categories))
    }

    fn prioritize_categories(
        &self,
        discovered: Vec<CategoryCandidate>,
        seed_url: &str,
        max_categories: Option<usize>,
    ) -> Vec<CategoryCandidate> {
        let mut prioritized: Vec<CategoryCandidate> = discovered
            .into_iter()
            .filter(|candidate| self.is_preferred_category_candidate(&candidate.url, candidate.label.as_deref()))
            .collect();

        prioritized.sort_by_key(|candidate| {
            self.category_priority(candidate.label.as_deref(), &candidate.url)
        });

        if prioritized.is_empty()
            && self.is_preferred_category_candidate(seed_url, None)
        {
            prioritized.push(CategoryCandidate::new(seed_url.to_string(), None));
        }

        if let Some(max) = max_categories {
            prioritized.truncate(max);
        }

        prioritized
    }

    fn category_priority(&self, label: Option<&str>, url: &str) -> usize {
        let fingerprint = format!(
            "{} {}",
            label.unwrap_or_default().to_lowercase(),
            url.to_lowercase()
        );

        let priorities = [
            "almacen",
            "bebidas",
            "desayuno",
            "merienda",
            "lacteos",
            "frescos",
            "congelados",
            "limpieza",
            "perfumeria",
            "farmacia",
        ];

        priorities
            .iter()
            .position(|keyword| fingerprint.contains(keyword))
            .unwrap_or(priorities.len() + 1)
    }

    fn is_preferred_category_candidate(&self, url: &str, label: Option<&str>) -> bool {
        let fingerprint = format!(
            "{} {}",
            label.unwrap_or_default().to_lowercase(),
            url.to_lowercase()
        );

        let excluded_keywords = [
            "electro",
            "tecnologia",
            "hogar",
            "muebles",
            "bazar",
            "deco",
            "jugueteria",
            "libreria",
            "automotor",
            "aire libre",
            "aire-libre",
            "ocio",
            "mundo bebe",
            "mundo-bebe",
            "textil",
            "calzado",
            "ferreteria",
            "jardin",
            "mascotas",
        ];

        if excluded_keywords
            .iter()
            .any(|keyword| fingerprint.contains(keyword))
        {
            return false;
        }

        let preferred_keywords = [
            "almacen",
            "bebidas",
            "desayuno",
            "merienda",
            "lacteos",
            "frescos",
            "congelados",
            "limpieza",
            "perfumeria",
            "farmacia",
            "golosinas",
            "snacks",
            "galletitas",
            "infusiones",
        ];

        preferred_keywords
            .iter()
            .any(|keyword| fingerprint.contains(keyword))
    }

    fn scan_category_pages<F>(
        &self,
        category_url: &str,
        category_tab: &Arc<Tab>,
        product_tab: &Arc<Tab>,
        category_label: Option<String>,
        start_page_number: usize,
        limit: Option<usize>,
        seen_links: &mut BTreeSet<String>,
        processed_products: &mut usize,
        on_page_complete: &mut impl FnMut(ScanPageProgress) -> Result<()>,
        on_product: &mut F,
    ) -> Result<()>
    where
        F: FnMut(ScrapedProductInput) -> Result<()>,
    {
        let base_category_url = self.remove_page_param(category_url);
        let mut page_number = start_page_number.max(1);

        loop {
            if limit.is_some_and(|max| *processed_products >= max) {
                break;
            }

            let page_url = self.build_category_page_url(&base_category_url, page_number);
            print_line(format!("  Página {} -> {}", page_number, page_url));
            self.open_page(category_tab, &page_url)?;
            self.accept_cookie_banner(category_tab)?;
            self.human_delay();

            let category_name = self
                .extract_category_name_from_category_page(category_tab)?
                .or_else(|| category_label.clone());

            let page_outcome = self.scan_loaded_category_page(
                category_tab,
                product_tab,
                category_name,
                limit,
                seen_links,
                processed_products,
                on_product,
            )?;

            if page_outcome.completed && page_outcome.new_links_total > 0 {
                on_page_complete(ScanPageProgress {
                    category_url: base_category_url.clone(),
                    page_url: page_url.clone(),
                    page_number,
                })?;
            }

            if limit.is_some_and(|max| *processed_products >= max) {
                break;
            }

            if page_outcome.new_links_total == 0 {
                break;
            }

            page_number += 1;
        }

        Ok(())
    }

    fn scan_loaded_category_page<F>(
        &self,
        category_tab: &Arc<Tab>,
        product_tab: &Arc<Tab>,
        category_name: Option<String>,
        limit: Option<usize>,
        seen_links: &mut BTreeSet<String>,
        processed_products: &mut usize,
        on_product: &mut F,
    ) -> Result<LoadedCategoryPageOutcome>
    where
        F: FnMut(ScrapedProductInput) -> Result<()>,
    {
        let mut idle_rounds = 0usize;
        let mut new_links_total = 0usize;
        let mut stopped_by_limit = false;

        loop {
            if limit.is_some_and(|max| *processed_products >= max) {
                stopped_by_limit = true;
                break;
            }

            let visible_links = self.collect_visible_product_links(category_tab)?;
            let mut processed_this_round = 0usize;

            for product_url in visible_links {
                if !seen_links.insert(product_url.clone()) {
                    continue;
                }

                processed_this_round += 1;
                new_links_total += 1;
                match self.extract_product(product_tab, &product_url, category_name.as_deref()) {
                    Ok(Some(product)) => {
                        print_line(format!(
                            "  ✓ {} | EAN: {}",
                            product.name,
                            product
                                .barcode
                                .clone()
                                .unwrap_or_else(|| "(sin EAN)".to_string())
                        ));
                        on_product(product)?;
                        *processed_products += 1;
                    }
                    Ok(None) => {
                        print_line(format!(
                            "  - Se omitio un producto sin nombre valido: {product_url}"
                        ));
                    }
                    Err(error) => {
                        print_error(format!("  x Error en {product_url}: {error}"));
                    }
                }

                if limit.is_some_and(|max| *processed_products >= max) {
                    stopped_by_limit = true;
                    break;
                }

                self.human_delay();
            }

            if limit.is_some_and(|max| *processed_products >= max) {
                stopped_by_limit = true;
                break;
            }

            if processed_this_round == 0 {
                idle_rounds += 1;
            } else {
                idle_rounds = 0;
            }

            let advanced = self.advance_category_listing(category_tab)?;
            if !advanced && idle_rounds >= 2 {
                break;
            }
        }

        Ok(LoadedCategoryPageOutcome {
            new_links_total,
            completed: !stopped_by_limit,
        })
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
        let started = Instant::now();
        let mut latest = Vec::new();

        while started.elapsed() < Duration::from_millis(PRODUCT_GRID_WAIT_MS) {
            latest = self.collect_visible_product_links_once(tab)?;
            if !latest.is_empty() {
                return Ok(latest);
            }

            let _ = tab.evaluate("window.scrollBy(0, Math.max(window.innerHeight * 0.7, 600));", false);
            thread::sleep(Duration::from_millis(POLL_INTERVAL_MS));
        }

        Ok(latest)
    }

    fn collect_visible_product_links_once(&self, tab: &Arc<Tab>) -> Result<Vec<String>> {
        let html = tab
            .get_content()
            .context("No pude leer el HTML de la categoria.")?;
        let document = Html::parse_document(&html);
        let selector = Selector::parse("a[href*='/p']").expect("selector valido");
        let mut links = BTreeSet::new();

        for anchor in document.select(&selector) {
            if let Some(href) = anchor.value().attr("href") {
                let absolute = if href.starts_with("http") {
                    href.to_string()
                } else {
                    format!("{CARREFOUR_BASE_URL}{href}")
                };

                if self.is_likely_product_url(&absolute) {
                    let normalized = absolute.split('?').next().unwrap_or(&absolute).to_string();
                    links.insert(normalized);
                }
            }
        }

        Ok(links.into_iter().collect())
    }

    fn collect_category_candidates(
        &self,
        tab: &Arc<Tab>,
        root_url: &str,
    ) -> Result<Vec<CategoryCandidate>> {
        let html = tab
            .get_content()
            .context("No pude leer el HTML al descubrir categorias.")?;
        let document = Html::parse_document(&html);
        let selector = Selector::parse("a[href]").expect("selector valido");
        let mut candidates = Vec::new();
        let mut seen = BTreeSet::new();

        for anchor in document.select(&selector) {
            let Some(href) = anchor.value().attr("href") else {
                continue;
            };

            let absolute = self.to_absolute_carrefour_url(href);
            if !self.is_likely_category_url(&absolute, root_url) {
                continue;
            }

            let normalized = self.normalize_category_url(&absolute);
            if !seen.insert(normalized.clone()) {
                continue;
            }

            let label = squeeze_spaces(&anchor.text().collect::<Vec<_>>().join(" "));
            let label = if label.is_empty() { None } else { Some(label) };
            candidates.push(CategoryCandidate::new(normalized, label));
        }

        Ok(candidates)
    }

    fn advance_category_listing(&self, tab: &Arc<Tab>) -> Result<bool> {
        let before = self.collect_visible_product_links_once(tab)?.len();

        tab.evaluate("window.scrollTo(0, document.body.scrollHeight);", false)
            .context("No pude hacer scroll en la categoria.")?;
        thread::sleep(Duration::from_millis(1800));
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
            ],
        )?;
        thread::sleep(Duration::from_millis(1800));

        let after = self.collect_visible_product_links_once(tab)?.len();
        Ok(after > before)
    }

    fn extract_product(
        &self,
        tab: &Arc<Tab>,
        product_url: &str,
        fallback_category_name: Option<&str>,
    ) -> Result<Option<ScrapedProductInput>> {
        self.open_page(tab, product_url)?;
        self.accept_cookie_banner(tab)?;
        self.expand_product_sections(tab)?;
        let html = self.wait_for_product_html(tab)?;
        let document = Html::parse_document(&html);

        let name = self
            .extract_first_text(&document, &["h1 .vtex-store-components-3-x-productBrand", "h1"])
            .unwrap_or_default();

        if name.trim().is_empty() {
            return Ok(None);
        }

        let brand = self.extract_first_text(
            &document,
            &[
                ".vtex-store-components-3-x-productBrandName",
                "[class*='brandName']",
            ],
        );

        let price_raw = self
            .extract_first_text(
                &document,
                &[
                    ".vtex-product-price-1-x-sellingPriceValue",
                    "[class*='price']",
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
                "img.vtex-store-components-3-x-productImageTag",
                "img[class*='productImage']",
            ],
            "src",
        );

        let description = self
            .extract_first_text(&document, &[".vtex-product-description-0-x-content"])
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

        let category_name = self
            .extract_category_from_breadcrumb(&document, &name)
            .or_else(|| fallback_category_name.map(|value| value.to_string()));

        if price_raw.is_none() && image_source_url.is_none() && barcode.is_none() && presentation.is_none() {
            return Ok(None);
        }

        Ok(Some(ScrapedProductInput {
            barcode,
            name: squeeze_spaces(&name),
            brand: brand.map(|value| squeeze_spaces(&value)),
            category_name,
            presentation,
            description: description.map(|value| squeeze_spaces(&value)),
            price_raw: price_raw.map(|value| squeeze_spaces(&value)),
            image_source_url,
            image: None,
            source_url: Some(product_url.to_string()),
        }))
    }

    fn wait_for_product_html(&self, tab: &Arc<Tab>) -> Result<String> {
        let started = Instant::now();
        let mut last_html = String::new();

        while started.elapsed() < Duration::from_millis(PRODUCT_READY_WAIT_MS) {
            let html = tab.get_content().context("No pude leer el HTML del producto.")?;
            let document = Html::parse_document(&html);

            let has_name = self
                .extract_first_text(&document, &["h1 .vtex-store-components-3-x-productBrand", "h1"])
                .is_some();
            let has_price = self
                .extract_first_text(
                    &document,
                    &[
                        ".vtex-product-price-1-x-sellingPriceValue",
                        "[class*='price']",
                    ],
                )
                .is_some();

            if has_name || has_price {
                return Ok(html);
            }

            last_html = html;
            thread::sleep(Duration::from_millis(POLL_INTERVAL_MS));
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
                "descripcion",
                "descripción",
            ],
        )?;
        Ok(())
    }

    fn accept_cookie_banner(&self, tab: &Arc<Tab>) -> Result<()> {
        self.click_first_text_button(tab, &["aceptar todo", "aceptar"])?;
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
            if ["contenido neto", "presentacion", "presentación", "peso neto", "volumen"]
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

    fn extract_category_name_from_category_page(&self, tab: &Arc<Tab>) -> Result<Option<String>> {
        let html = tab
            .get_content()
            .context("No pude leer la categoria para tomar el nombre.")?;
        let document = Html::parse_document(&html);
        Ok(self.extract_first_text(
            &document,
            &[
                "main h1",
                "h1[class*='gallery']",
                "h1[class*='title']",
                "h1",
            ],
        ))
    }

    fn extract_category_from_breadcrumb(&self, document: &Html, product_name: &str) -> Option<String> {
        let selectors = [
            "nav[aria-label*='breadcrumb'] a",
            "[class*='breadcrumb'] a",
            "[class*='breadcrumb'] span",
        ];

        let mut crumbs = Vec::new();
        for selector_text in selectors {
            let selector = Selector::parse(selector_text).ok()?;
            for element in document.select(&selector) {
                let text = squeeze_spaces(&element.text().collect::<Vec<_>>().join(" "));
                if text.is_empty() {
                    continue;
                }
                let normalized = text.to_lowercase();
                if normalized == "inicio" || normalized == product_name.to_lowercase() {
                    continue;
                }
                if !crumbs.contains(&text) {
                    crumbs.push(text);
                }
            }
            if !crumbs.is_empty() {
                break;
            }
        }

        crumbs.pop()
    }

    fn to_absolute_carrefour_url(&self, href: &str) -> String {
        if href.starts_with("http") {
            href.to_string()
        } else if href.starts_with('/') {
            format!("{CARREFOUR_BASE_URL}{href}")
        } else {
            format!("{CARREFOUR_BASE_URL}/{href}")
        }
    }

    fn normalize_category_url(&self, url: &str) -> String {
        url.split('#')
            .next()
            .unwrap_or(url)
            .split('?')
            .next()
            .unwrap_or(url)
            .trim_end_matches('/')
            .to_string()
    }

    fn build_category_page_url(&self, category_url: &str, page_number: usize) -> String {
        let base = category_url.split('#').next().unwrap_or(category_url);
        let mut parts = base.splitn(2, '?');
        let path = parts.next().unwrap_or(base);
        let query = parts.next();

        let mut params: Vec<(String, String)> = query
            .map(|value| {
                value
                    .split('&')
                    .filter(|pair| !pair.trim().is_empty())
                    .filter_map(|pair| {
                        let mut chunks = pair.splitn(2, '=');
                        let key = chunks.next()?.trim();
                        if key.eq_ignore_ascii_case("page") {
                            return None;
                        }
                        let value = chunks.next().unwrap_or("").trim();
                        Some((key.to_string(), value.to_string()))
                    })
                    .collect()
            })
            .unwrap_or_default();

        if page_number > 1 {
            params.push(("page".to_string(), page_number.to_string()));
        }

        if params.is_empty() {
            path.to_string()
        } else {
            let query_string = params
                .into_iter()
                .map(|(key, value)| {
                    if value.is_empty() {
                        key
                    } else {
                        format!("{key}={value}")
                    }
                })
                .collect::<Vec<_>>()
                .join("&");
            format!("{path}?{query_string}")
        }
    }

    fn remove_page_param(&self, category_url: &str) -> String {
        self.build_category_page_url(category_url, 1)
    }

    fn extract_page_number(&self, category_url: &str) -> Option<usize> {
        let query = category_url.split('?').nth(1)?;
        for pair in query.split('&') {
            let mut chunks = pair.splitn(2, '=');
            let key = chunks.next()?.trim();
            let value = chunks.next().unwrap_or("").trim();
            if key.eq_ignore_ascii_case("page") {
                if let Ok(parsed) = value.parse::<usize>() {
                    if parsed >= 1 {
                        return Some(parsed);
                    }
                }
            }
        }
        None
    }

    fn normalize_product_url(&self, url: &str) -> String {
        self.normalize_category_url(url)
    }

    fn is_carrefour_home(&self, url: &str) -> bool {
        let normalized = self.normalize_category_url(url);
        normalized == CARREFOUR_BASE_URL
    }

    fn is_likely_category_url(&self, absolute_url: &str, root_url: &str) -> bool {
        if !absolute_url.starts_with(CARREFOUR_BASE_URL) {
            return false;
        }

        if absolute_url.contains("/p") {
            return false;
        }

        let normalized = self.normalize_category_url(absolute_url);
        let root_normalized = self.normalize_category_url(root_url);
        if normalized == self.normalize_category_url(CARREFOUR_BASE_URL)
            || (!root_normalized.is_empty() && normalized == root_normalized)
        {
            return false;
        }

        let path = normalized.trim_start_matches(CARREFOUR_BASE_URL);
        if path.is_empty() || path == "/" {
            return false;
        }

        let reserved_fragments = [
            "/account",
            "/login",
            "/checkout",
            "/cart",
            "/busca",
            "/search",
            "/institucional",
            "/club",
            "/stores",
            "/ajuda",
            "/help",
            "/faq",
            "/politicas",
            "/contacto",
        ];

        if reserved_fragments
            .iter()
            .any(|fragment| path.contains(fragment))
        {
            return false;
        }

        let segments: Vec<&str> = path.split('/').filter(|segment| !segment.is_empty()).collect();
        if segments.is_empty() || segments.len() > 5 {
            return false;
        }

        true
    }

    fn is_likely_product_url(&self, absolute_url: &str) -> bool {
        if !absolute_url.starts_with(CARREFOUR_BASE_URL) {
            return false;
        }

        let normalized = self.normalize_product_url(absolute_url);
        let path = normalized.trim_start_matches(CARREFOUR_BASE_URL);
        if path.is_empty() {
            return false;
        }

        if !path.ends_with("/p") {
            return false;
        }

        let reserved_fragments = [
            "/promociones",
            "/app",
            "/busca",
            "/search",
            "/institucional",
            "/club",
            "/stores",
        ];

        !reserved_fragments.iter().any(|fragment| path.contains(fragment))
    }

    fn wait_for_document_ready(&self, tab: &Arc<Tab>, timeout: Duration) -> Result<()> {
        let started = Instant::now();
        while started.elapsed() < timeout {
            if let Ok(result) = tab.evaluate("document.readyState", true) {
                if let Some(value) = result.value {
                    if value.as_str() == Some("complete") || value.as_str() == Some("interactive")
                    {
                        return Ok(());
                    }
                }
            }
            thread::sleep(Duration::from_millis(300));
        }

        Ok(())
    }

    fn human_delay(&self) {
        let seconds = rand::rng().random_range(self.min_delay_seconds..=self.max_delay_seconds);
        thread::sleep(Duration::from_secs_f64(seconds));
    }
}

fn print_line(message: impl AsRef<str>) {
    println!("{}", message.as_ref());
    let _ = io::stdout().flush();
}

fn print_error(message: impl AsRef<str>) {
    eprintln!("{}", message.as_ref());
    let _ = io::stderr().flush();
}

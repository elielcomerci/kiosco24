use regex::Regex;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use crate::models::{RemoteProductSnapshot, ScrapedProductInput};

pub fn normalize_barcode(value: Option<&str>) -> Option<String> {
    let digits: String = value
        .unwrap_or_default()
        .chars()
        .filter(|char| char.is_ascii_digit())
        .collect();

    if digits.is_empty() {
        None
    } else {
        Some(digits)
    }
}

pub fn normalize_title(value: &str) -> String {
    squeeze_spaces(value)
}

pub fn normalize_optional_title(value: Option<&str>) -> Option<String> {
    let normalized = squeeze_spaces(value.unwrap_or_default());
    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

pub fn normalize_description(value: Option<&str>) -> Option<String> {
    let normalized = squeeze_spaces(value.unwrap_or_default());
    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

pub fn squeeze_spaces(value: &str) -> String {
    value
        .split_whitespace()
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string()
}

pub fn slugify(value: &str, fallback: &str) -> String {
    let base = if value.trim().is_empty() { fallback } else { value };
    let lowered = base.to_lowercase();
    let ascii_only: String = lowered
        .chars()
        .map(|char| match char {
            'á' | 'à' | 'ä' | 'â' => 'a',
            'é' | 'è' | 'ë' | 'ê' => 'e',
            'í' | 'ì' | 'ï' | 'î' => 'i',
            'ó' | 'ò' | 'ö' | 'ô' => 'o',
            'ú' | 'ù' | 'ü' | 'û' => 'u',
            'ñ' => 'n',
            other => other,
        })
        .collect();

    let cleaned = Regex::new(r"[^a-z0-9]+")
        .expect("regex valida")
        .replace_all(&ascii_only, "-")
        .to_string();

    cleaned.trim_matches('-').to_string()
}

pub fn build_content_hash(product: &ScrapedProductInput) -> String {
    let payload = json!({
        "barcode": normalize_barcode(product.barcode.as_deref()),
        "name": normalize_title(&product.name),
        "brand": normalize_optional_title(product.brand.as_deref()),
        "categoryName": normalize_optional_title(product.category_name.as_deref()),
        "presentation": normalize_optional_title(product.presentation.as_deref()),
        "description": normalize_description(product.description.as_deref()),
        "imageSourceUrl": product.image_source_url.as_deref().map(str::trim).filter(|value| !value.is_empty()),
        "sourceUrl": product.source_url.as_deref().map(str::trim).filter(|value| !value.is_empty()),
    });

    let mut hasher = Sha256::new();
    hasher.update(payload.to_string().as_bytes());
    format!("{:x}", hasher.finalize())
}

pub fn normalize_scraped_product(product: &ScrapedProductInput) -> ScrapedProductInput {
    ScrapedProductInput {
        barcode: normalize_barcode(product.barcode.as_deref()),
        name: normalize_title(&product.name),
        brand: normalize_optional_title(product.brand.as_deref()),
        category_name: normalize_optional_title(product.category_name.as_deref()),
        presentation: normalize_optional_title(product.presentation.as_deref()),
        description: normalize_description(product.description.as_deref()),
        price_raw: normalize_optional_title(product.price_raw.as_deref()),
        image_source_url: product
            .image_source_url
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string),
        image: product
            .image
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string),
        source_url: product
            .source_url
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string),
    }
}

pub fn diff_against_remote(local: &ScrapedProductInput, remote: &RemoteProductSnapshot) -> Vec<String> {
    let mut fields = Vec::new();

    if normalize_title(&local.name) != normalize_title(&remote.name) {
        fields.push("name".to_string());
    }
    if normalize_optional_title(local.brand.as_deref()) != normalize_optional_title(remote.brand.as_deref()) {
        fields.push("brand".to_string());
    }
    if normalize_optional_title(local.category_name.as_deref())
        != normalize_optional_title(remote.category_name.as_deref())
    {
        fields.push("categoryName".to_string());
    }
    if normalize_optional_title(local.presentation.as_deref())
        != normalize_optional_title(remote.presentation.as_deref())
    {
        fields.push("presentation".to_string());
    }
    if normalize_description(local.description.as_deref())
        != normalize_description(remote.description.as_deref())
    {
        fields.push("description".to_string());
    }

    let local_image = local.image.as_deref().map(str::trim).filter(|value| !value.is_empty());
    let remote_image = remote.image.as_deref().map(str::trim).filter(|value| !value.is_empty());
    if local_image != remote_image {
        fields.push("image".to_string());
    }

    fields
}

pub fn remote_snapshot_to_json(snapshot: &RemoteProductSnapshot) -> Value {
    json!({
        "id": snapshot.id,
        "barcode": snapshot.barcode,
        "name": snapshot.name,
        "brand": snapshot.brand,
        "categoryName": snapshot.category_name,
        "presentation": snapshot.presentation,
        "description": snapshot.description,
        "image": snapshot.image,
        "status": snapshot.status,
        "updatedAt": snapshot.updated_at,
        "matchedVariant": snapshot.matched_variant,
    })
}

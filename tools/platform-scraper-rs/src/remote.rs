use anyhow::{Context, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    models::{CompareOutcome, RemoteProductSnapshot, ScrapedProductInput, SyncStatus},
    normalize::{diff_against_remote, remote_snapshot_to_json},
};

#[derive(Clone)]
pub struct Kiosco24Client {
    base_url: String,
    token: String,
    client: Client,
}

impl Kiosco24Client {
    pub fn new(base_url: impl Into<String>, token: impl Into<String>) -> Result<Self> {
        let client = Client::builder()
            .user_agent("platform-scraper-rs/0.1")
            .build()
            .context("No pude crear el cliente HTTP.")?;

        Ok(Self {
            base_url: base_url.into().trim_end_matches('/').to_string(),
            token: token.into(),
            client,
        })
    }

    pub async fn compare_barcode(&self, product: &ScrapedProductInput) -> Result<CompareOutcome> {
        let Some(barcode) = product.barcode.as_deref() else {
            return Ok(CompareOutcome {
                sync_status: SyncStatus::New,
                remote_platform_product_id: None,
                remote_owner_type: None,
                remote_snapshot: None,
                conflict_fields: None,
            });
        };

        let response = self
            .client
            .get(format!("{}/api/platform-ingest", self.base_url))
            .query(&[("barcode", barcode)])
            .header("x-platform-ingest-token", &self.token)
            .send()
            .await
            .context("No pude consultar la base colaborativa de kiosco24.")?;

        let response = response
            .error_for_status()
            .context("La comparación con kiosco24 devolvió error.")?;

        let payload: CompareResponse = response.json().await?;

        if !payload.found {
            return Ok(CompareOutcome {
                sync_status: SyncStatus::New,
                remote_platform_product_id: None,
                remote_owner_type: None,
                remote_snapshot: None,
                conflict_fields: None,
            });
        }

        let remote = payload
            .product
            .context("kiosco24 respondió found=true pero sin producto.")?;
        let diff_fields = diff_against_remote(product, &remote);

        Ok(CompareOutcome {
            sync_status: if diff_fields.is_empty() {
                SyncStatus::Matched
            } else {
                SyncStatus::Conflict
            },
            remote_platform_product_id: Some(remote.id.clone()),
            remote_owner_type: payload.owner_type,
            remote_snapshot: Some(remote_snapshot_to_json(&remote)),
            conflict_fields: if diff_fields.is_empty() {
                None
            } else {
                Some(json!(diff_fields))
            },
        })
    }

    pub async fn publish_product(&self, product: &ScrapedProductInput) -> Result<PublishResponse> {
        let response = self
            .client
            .post(format!("{}/api/platform-ingest", self.base_url))
            .header("x-platform-ingest-token", &self.token)
            .json(&PublishRequest {
                barcode: product.barcode.clone(),
                name: product.name.clone(),
                brand: product.brand.clone(),
                category_name: product.category_name.clone(),
                presentation: product.presentation.clone(),
                description: product.description.clone(),
                image: product.image.clone(),
                image_source_url: product.image_source_url.clone(),
                status: Some("APPROVED".to_string()),
            })
            .send()
            .await
            .context("No pude publicar el producto en kiosco24.")?;

        let response = response
            .error_for_status()
            .context("kiosco24 rechazó la publicación del producto.")?;

        Ok(response.json().await?)
    }
}

#[derive(Debug, Deserialize)]
struct CompareResponse {
    found: bool,
    #[serde(rename = "ownerType")]
    owner_type: Option<String>,
    product: Option<RemoteProductSnapshot>,
}

#[derive(Debug, Serialize)]
struct PublishRequest {
    barcode: Option<String>,
    name: String,
    brand: Option<String>,
    #[serde(rename = "categoryName")]
    category_name: Option<String>,
    presentation: Option<String>,
    description: Option<String>,
    image: Option<String>,
    #[serde(rename = "imageSourceUrl")]
    image_source_url: Option<String>,
    status: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
pub struct PublishResponse {
    pub product: PublishedRemoteProduct,
    #[serde(rename = "localizedImage")]
    pub localized_image: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
pub struct PublishedRemoteProduct {
    pub id: String,
    pub barcode: Option<String>,
    pub name: String,
    pub brand: Option<String>,
    #[serde(rename = "categoryName")]
    pub category_name: Option<String>,
    pub presentation: Option<String>,
    pub description: Option<String>,
    pub image: Option<String>,
    pub status: Option<String>,
}

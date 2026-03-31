use anyhow::{anyhow, Context, Result};
use aws_sdk_s3::{
    config::{Builder as S3ConfigBuilder, Credentials, Region},
    primitives::ByteStream,
    Client,
};
use reqwest::header::CONTENT_TYPE;
use uuid::Uuid;

use crate::{config::AppConfig, normalize::slugify};

#[derive(Clone)]
pub struct R2Storage {
    client: Client,
    bucket: String,
    public_base_url: String,
}

impl R2Storage {
    pub async fn new(config: &AppConfig) -> Result<Self> {
        let credentials = Credentials::new(
            config.r2_access_key_id.clone(),
            config.r2_secret_access_key.clone(),
            None,
            None,
            "platform-scraper-rs",
        );

        let shared_config = aws_config::defaults(aws_config::BehaviorVersion::latest())
            .region(Region::new("auto"))
            .load()
            .await;

        let s3_config = S3ConfigBuilder::from(&shared_config)
            .credentials_provider(credentials)
            .endpoint_url(config.r2_endpoint.clone())
            .force_path_style(true)
            .build();

        Ok(Self {
            client: Client::from_conf(s3_config),
            bucket: config.r2_bucket_name.clone(),
            public_base_url: config.r2_public_base_url.trim_end_matches('/').to_string(),
        })
    }

    pub async fn localize_remote_image(
        &self,
        image_url: &str,
        barcode: Option<&str>,
        name: &str,
    ) -> Result<String> {
        let response = reqwest::Client::builder()
            .user_agent("platform-scraper-rs/0.1")
            .build()?
            .get(image_url)
            .send()
            .await
            .with_context(|| format!("No pude descargar la imagen {image_url}."))?
            .error_for_status()
            .with_context(|| format!("La imagen {image_url} devolvió error."))?;

        let headers = response.headers().clone();
        let bytes = response.bytes().await?;
        if bytes.is_empty() {
            return Err(anyhow!("La imagen descargada vino vacía."));
        }

        let content_type = headers
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("image/jpeg");

        let extension = if content_type.contains("png") {
            "png"
        } else if content_type.contains("webp") {
            "webp"
        } else if content_type.contains("avif") {
            "avif"
        } else {
            "jpg"
        };

        let base_name = slugify(barcode.unwrap_or(name), "scraped-product");
        let key = format!("scraper/products/{base_name}-{}.{}", Uuid::new_v4(), extension);

        self.client
            .put_object()
            .bucket(&self.bucket)
            .key(&key)
            .content_type(content_type)
            .cache_control("public, max-age=31536000, immutable")
            .body(ByteStream::from(bytes.to_vec()))
            .send()
            .await
            .context("No pude subir la imagen a Cloudflare R2.")?;

        Ok(format!("{}/{}", self.public_base_url, key))
    }
}

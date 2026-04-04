use anyhow::{Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use std::{
    collections::BTreeSet,
    path::{Path, PathBuf},
};
use tokio::fs::{File, OpenOptions};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader, BufWriter};
use uuid::Uuid;

use crate::{
    models::{ScrapedProductInput, ScraperSource},
    normalize::normalize_source_url,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BufferedProduct {
    pub id: String,
    pub run_id: String,
    #[serde(default = "default_business_activity")]
    pub business_activity: String,
    pub source: String,
    pub barcode: Option<String>,
    pub name: String,
    pub brand: Option<String>,
    pub category_name: Option<String>,
    pub description: Option<String>,
    pub presentation: Option<String>,
    pub price_raw: Option<String>,
    pub image: Option<String>,
    pub image_source_url: Option<String>,
    pub source_url: Option<String>,
    pub content_hash: Option<String>,
    pub created_at: String,
}

impl BufferedProduct {
    pub fn from_input(
        run_id: &str,
        business_activity: &str,
        source: ScraperSource,
        product: &ScrapedProductInput,
        content_hash: Option<String>,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            run_id: run_id.to_string(),
            business_activity: business_activity.trim().to_uppercase(),
            source: source.as_db_value().to_string(),
            barcode: product.barcode.clone(),
            name: product.name.clone(),
            brand: product.brand.clone(),
            category_name: product.category_name.clone(),
            description: product.description.clone(),
            presentation: product.presentation.clone(),
            price_raw: product.price_raw.clone(),
            image: product.image.clone(),
            image_source_url: product.image_source_url.clone(),
            source_url: product.source_url.clone(),
            content_hash,
            created_at: Utc::now().to_rfc3339(),
        }
    }
}

fn default_business_activity() -> String {
    "KIOSCO".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct BufferCheckpoint {
    flushed_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanProgressCheckpoint {
    pub run_id: String,
    pub source: String,
    pub seed_url: String,
    pub root_url: Option<String>,
    pub last_completed_category_url: Option<String>,
    pub last_completed_page_url: Option<String>,
    pub last_completed_page_number: Option<usize>,
    pub updated_at: String,
}

impl ScanProgressCheckpoint {
    pub fn new(
        run_id: &str,
        source: ScraperSource,
        seed_url: &str,
        root_url: Option<&str>,
    ) -> Self {
        Self {
            run_id: run_id.to_string(),
            source: source.as_db_value().to_string(),
            seed_url: seed_url.to_string(),
            root_url: root_url.map(str::to_string),
            last_completed_category_url: None,
            last_completed_page_url: None,
            last_completed_page_number: None,
            updated_at: Utc::now().to_rfc3339(),
        }
    }

    pub fn update_page(&mut self, category_url: &str, page_url: &str, page_number: usize) {
        self.last_completed_category_url = Some(category_url.to_string());
        self.last_completed_page_url = Some(page_url.to_string());
        self.last_completed_page_number = Some(page_number);
        self.updated_at = Utc::now().to_rfc3339();
    }
}

pub struct LocalBuffer {
    file_path: PathBuf,
    checkpoint_path: PathBuf,
    writer: BufWriter<File>,
    count: usize,
    flushed_count: usize,
}

impl LocalBuffer {
    pub async fn new(output_dir: &PathBuf, run_id: &str) -> Result<Self> {
        tokio::fs::create_dir_all(output_dir).await?;
        let file_path = output_dir.join(format!("buffer-{}.jsonl", run_id));
        let checkpoint_path = checkpoint_path_for_buffer(&file_path);
        let existing_count = if file_path.exists() {
            count_buffer_file(&file_path).await?
        } else {
            0
        };
        let flushed_count = read_buffer_checkpoint(&checkpoint_path).await?;

        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&file_path)
            .await
            .with_context(|| format!("No pude abrir el archivo buffer: {}", file_path.display()))?;

        Ok(Self {
            file_path,
            checkpoint_path,
            writer: BufWriter::new(file),
            count: existing_count,
            flushed_count,
        })
    }

    pub async fn write(&mut self, product: &BufferedProduct) -> Result<()> {
        let line = serde_json::to_string(product)?;
        self.writer.write_all(line.as_bytes()).await?;
        self.writer.write_all(b"\n").await?;
        self.writer.flush().await?;
        self.count += 1;
        Ok(())
    }

    pub fn count(&self) -> usize {
        self.count
    }

    pub fn flushed_count(&self) -> usize {
        self.flushed_count
    }

    pub fn pending_count(&self) -> usize {
        self.count.saturating_sub(self.flushed_count)
    }

    pub fn path(&self) -> &PathBuf {
        &self.file_path
    }

    pub fn checkpoint_path(&self) -> &PathBuf {
        &self.checkpoint_path
    }

    pub async fn mark_flushed(&mut self, count: usize) -> Result<()> {
        self.flushed_count += count;
        write_buffer_checkpoint(&self.checkpoint_path, self.flushed_count).await
    }
}

pub fn checkpoint_path_for_buffer(path: &Path) -> PathBuf {
    path.with_extension("checkpoint.json")
}

pub fn scan_progress_path_for_run(output_dir: &Path, run_id: &str) -> PathBuf {
    output_dir.join(format!("scan-progress-{run_id}.json"))
}

fn backup_path_for_checkpoint(path: &Path) -> PathBuf {
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .map(|value| format!("{value}.bak"))
        .unwrap_or_else(|| "checkpoint.bak".to_string());
    path.with_file_name(file_name)
}

fn sanitize_checkpoint_content(bytes: &[u8]) -> Option<String> {
    let content = String::from_utf8_lossy(bytes).replace('\0', "");
    let trimmed = content.trim_matches('\u{feff}').trim();
    if trimmed.is_empty() {
        return None;
    }

    Some(trimmed.to_string())
}

async fn write_checkpoint_with_backup(path: &PathBuf, content: &str, label: &str) -> Result<()> {
    tokio::fs::write(path, content)
        .await
        .with_context(|| format!("No pude escribir el {label}: {}", path.display()))?;

    let backup_path = backup_path_for_checkpoint(path);
    tokio::fs::write(&backup_path, content)
        .await
        .with_context(|| format!("No pude escribir el backup del {label}: {}", backup_path.display()))?;

    Ok(())
}

async fn read_checkpoint_with_fallback<T>(
    path: &PathBuf,
    label: &str,
    allow_missing: bool,
) -> Result<Option<T>>
where
    T: DeserializeOwned,
{
    let backup_path = backup_path_for_checkpoint(path);
    let mut last_error = None;
    let mut saw_candidate = false;

    for candidate in [path.clone(), backup_path.clone()] {
        if !candidate.exists() {
            continue;
        }

        saw_candidate = true;

        let bytes = match tokio::fs::read(&candidate).await {
            Ok(bytes) => bytes,
            Err(error) => {
                last_error = Some(format!(
                    "No pude leer el {label}: {} ({error})",
                    candidate.display()
                ));
                continue;
            }
        };

        let Some(content) = sanitize_checkpoint_content(&bytes) else {
            last_error = Some(format!(
                "El {label} quedó vacío o corrupto: {}",
                candidate.display()
            ));
            continue;
        };

        match serde_json::from_str::<T>(&content) {
            Ok(value) => {
                if candidate != *path {
                    eprintln!(
                        "Recuperé el {label} desde el backup: {}",
                        candidate.display()
                    );
                    let _ = write_checkpoint_with_backup(path, &content, label).await;
                }
                return Ok(Some(value));
            }
            Err(error) => {
                last_error = Some(format!(
                    "No pude parsear el {label}: {} ({error})",
                    candidate.display()
                ));
            }
        }
    }

    if !saw_candidate && allow_missing {
        return Ok(None);
    }

    if allow_missing {
        if let Some(error) = last_error {
            eprintln!(
                "Ignoro el {label} dañado y sigo sin resume automático. {error}"
            );
        }
        return Ok(None);
    }

    Err(anyhow::anyhow!(
        "{}",
        last_error.unwrap_or_else(|| format!("No pude recuperar el {label}."))
    ))
}

#[allow(dead_code)]
pub async fn read_buffer_file(path: &PathBuf) -> Result<Vec<BufferedProduct>> {
    read_buffer_file_from(path, 0).await
}

pub async fn read_buffer_file_from(path: &PathBuf, start_at: usize) -> Result<Vec<BufferedProduct>> {
    let file = File::open(path)
        .await
        .with_context(|| format!("No pude abrir el buffer: {}", path.display()))?;
    let reader = BufReader::new(file);
    let mut lines = reader.lines();
    let mut products = Vec::new();
    let mut index = 0usize;

    while let Some(line) = lines.next_line().await? {
        if line.trim().is_empty() {
            continue;
        }
        if index < start_at {
            index += 1;
            continue;
        }
        let product: BufferedProduct = serde_json::from_str(&line)
            .with_context(|| format!("No pude parsear la linea del buffer: {}", line))?;
        products.push(product);
        index += 1;
    }

    Ok(products)
}

pub async fn count_buffer_file(path: &PathBuf) -> Result<usize> {
    let file = File::open(path)
        .await
        .with_context(|| format!("No pude abrir el buffer: {}", path.display()))?;
    let reader = BufReader::new(file);
    let mut lines = reader.lines();
    let mut count = 0;

    while let Some(line) = lines.next_line().await? {
        if !line.trim().is_empty() {
            count += 1;
        }
    }

    Ok(count)
}

pub async fn read_buffer_source_urls(path: &PathBuf) -> Result<BTreeSet<String>> {
    if !path.exists() {
        return Ok(BTreeSet::new());
    }

    let file = File::open(path)
        .await
        .with_context(|| format!("No pude abrir el buffer: {}", path.display()))?;
    let reader = BufReader::new(file);
    let mut lines = reader.lines();
    let mut urls = BTreeSet::new();

    while let Some(line) = lines.next_line().await? {
        if line.trim().is_empty() {
            continue;
        }
        let product: BufferedProduct = serde_json::from_str(&line)
            .with_context(|| format!("No pude parsear la linea del buffer: {}", line))?;
        if let Some(source_url) = product.source_url {
            if let Some(normalized) = normalize_source_url(Some(source_url.as_str())) {
                urls.insert(normalized);
            }
        }
    }

    Ok(urls)
}

pub async fn read_buffer_checkpoint(path: &PathBuf) -> Result<usize> {
    if !path.exists() && !backup_path_for_checkpoint(path).exists() {
        return Ok(0);
    }

    let checkpoint = read_checkpoint_with_fallback::<BufferCheckpoint>(path, "checkpoint", false)
        .await?
        .context("No pude recuperar el checkpoint.")?;
    Ok(checkpoint.flushed_count)
}

pub async fn write_buffer_checkpoint(path: &PathBuf, flushed_count: usize) -> Result<()> {
    let content = serde_json::to_string_pretty(&BufferCheckpoint { flushed_count })?;
    write_checkpoint_with_backup(path, &content, "checkpoint").await?;
    Ok(())
}

pub async fn read_scan_progress_checkpoint(path: &PathBuf) -> Result<Option<ScanProgressCheckpoint>> {
    if !path.exists() && !backup_path_for_checkpoint(path).exists() {
        return Ok(None);
    }

    read_checkpoint_with_fallback::<ScanProgressCheckpoint>(
        path,
        "checkpoint de scan",
        true,
    )
    .await
}

pub async fn write_scan_progress_checkpoint(
    path: &PathBuf,
    checkpoint: &ScanProgressCheckpoint,
) -> Result<()> {
    let content = serde_json::to_string_pretty(checkpoint)?;
    write_checkpoint_with_backup(path, &content, "checkpoint de scan").await?;
    Ok(())
}

pub async fn cleanup_scan_progress_checkpoint(path: &PathBuf) -> Result<()> {
    if path.exists() {
        tokio::fs::remove_file(path)
            .await
            .with_context(|| format!("No pude eliminar el checkpoint de scan: {}", path.display()))?;
    }

    let backup_path = backup_path_for_checkpoint(path);
    if backup_path.exists() {
        tokio::fs::remove_file(&backup_path)
            .await
            .with_context(|| format!("No pude eliminar el backup del checkpoint de scan: {}", backup_path.display()))?;
    }

    Ok(())
}

pub async fn cleanup_buffer_file(path: &PathBuf) -> Result<()> {
    tokio::fs::remove_file(path)
        .await
        .with_context(|| format!("No pude eliminar el buffer: {}", path.display()))?;

    let checkpoint_path = checkpoint_path_for_buffer(path);
    if checkpoint_path.exists() {
        tokio::fs::remove_file(&checkpoint_path)
            .await
            .with_context(|| format!("No pude eliminar el checkpoint: {}", checkpoint_path.display()))?;
    }

    let checkpoint_backup_path = backup_path_for_checkpoint(&checkpoint_path);
    if checkpoint_backup_path.exists() {
        tokio::fs::remove_file(&checkpoint_backup_path)
            .await
            .with_context(|| format!("No pude eliminar el backup del checkpoint: {}", checkpoint_backup_path.display()))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn unique_temp_path(prefix: &str) -> PathBuf {
        std::env::temp_dir().join(format!("{prefix}-{}.json", Uuid::new_v4()))
    }

    async fn cleanup_checkpoint_pair(path: &PathBuf) {
        let _ = tokio::fs::remove_file(path).await;
        let _ = tokio::fs::remove_file(backup_path_for_checkpoint(path)).await;
    }

    #[tokio::test]
    async fn scan_progress_recovers_from_backup_when_primary_is_zeroed() {
        let path = unique_temp_path("scan-progress");
        let backup_path = backup_path_for_checkpoint(&path);
        let checkpoint = ScanProgressCheckpoint::new(
            "run-test",
            ScraperSource::Carrefour,
            "https://www.carrefour.com.ar/",
            Some("https://www.carrefour.com.ar/"),
        );

        tokio::fs::write(&path, vec![0u8; 128]).await.unwrap();
        tokio::fs::write(&backup_path, serde_json::to_string_pretty(&checkpoint).unwrap())
            .await
            .unwrap();

        let restored = read_scan_progress_checkpoint(&path).await.unwrap().unwrap();
        let restored_primary = tokio::fs::read_to_string(&path).await.unwrap();

        assert_eq!(restored.run_id, checkpoint.run_id);
        assert!(restored_primary.contains("\"run_id\": \"run-test\""));

        cleanup_checkpoint_pair(&path).await;
    }

    #[tokio::test]
    async fn scan_progress_ignores_zeroed_primary_without_backup() {
        let path = unique_temp_path("scan-progress");
        tokio::fs::write(&path, vec![0u8; 64]).await.unwrap();

        let restored = read_scan_progress_checkpoint(&path).await.unwrap();
        assert!(restored.is_none());

        cleanup_checkpoint_pair(&path).await;
    }

    #[tokio::test]
    async fn buffer_checkpoint_recovers_from_backup() {
        let path = unique_temp_path("buffer-checkpoint");
        let backup_path = backup_path_for_checkpoint(&path);

        tokio::fs::write(&path, vec![0u8; 32]).await.unwrap();
        tokio::fs::write(
            &backup_path,
            serde_json::to_string_pretty(&BufferCheckpoint { flushed_count: 42 }).unwrap(),
        )
        .await
        .unwrap();

        let restored = read_buffer_checkpoint(&path).await.unwrap();
        let restored_primary = tokio::fs::read_to_string(&path).await.unwrap();

        assert_eq!(restored, 42);
        assert!(restored_primary.contains("\"flushed_count\": 42"));

        cleanup_checkpoint_pair(&path).await;
    }
}

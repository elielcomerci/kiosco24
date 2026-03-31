use anyhow::{Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};
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
        source: ScraperSource,
        product: &ScrapedProductInput,
        content_hash: Option<String>,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            run_id: run_id.to_string(),
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
    if !path.exists() {
        return Ok(0);
    }

    let content = tokio::fs::read_to_string(path)
        .await
        .with_context(|| format!("No pude leer el checkpoint: {}", path.display()))?;
    let checkpoint: BufferCheckpoint = serde_json::from_str(&content)
        .with_context(|| format!("No pude parsear el checkpoint: {}", path.display()))?;
    Ok(checkpoint.flushed_count)
}

pub async fn write_buffer_checkpoint(path: &PathBuf, flushed_count: usize) -> Result<()> {
    let content = serde_json::to_string_pretty(&BufferCheckpoint { flushed_count })?;
    tokio::fs::write(path, content)
        .await
        .with_context(|| format!("No pude escribir el checkpoint: {}", path.display()))?;
    Ok(())
}

pub async fn read_scan_progress_checkpoint(path: &PathBuf) -> Result<Option<ScanProgressCheckpoint>> {
    if !path.exists() {
        return Ok(None);
    }

    let content = tokio::fs::read_to_string(path)
        .await
        .with_context(|| format!("No pude leer el checkpoint de scan: {}", path.display()))?;
    let checkpoint: ScanProgressCheckpoint = serde_json::from_str(&content)
        .with_context(|| format!("No pude parsear el checkpoint de scan: {}", path.display()))?;
    Ok(Some(checkpoint))
}

pub async fn write_scan_progress_checkpoint(
    path: &PathBuf,
    checkpoint: &ScanProgressCheckpoint,
) -> Result<()> {
    let content = serde_json::to_string_pretty(checkpoint)?;
    tokio::fs::write(path, content)
        .await
        .with_context(|| format!("No pude escribir el checkpoint de scan: {}", path.display()))?;
    Ok(())
}

pub async fn cleanup_scan_progress_checkpoint(path: &PathBuf) -> Result<()> {
    if path.exists() {
        tokio::fs::remove_file(path)
            .await
            .with_context(|| format!("No pude eliminar el checkpoint de scan: {}", path.display()))?;
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

    Ok(())
}

use chrono::NaiveDateTime;
use clap::{Parser, Subcommand, ValueEnum};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, ValueEnum)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ScraperSource {
    Carrefour,
    Coto,
}

impl ScraperSource {
    pub fn as_db_value(self) -> &'static str {
        match self {
            Self::Carrefour => "CARREFOUR",
            Self::Coto => "COTO",
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub enum RunStatus {
    Running,
    Completed,
    Failed,
}

impl RunStatus {
    pub fn as_db_value(self) -> &'static str {
        match self {
            Self::Running => "RUNNING",
            Self::Completed => "COMPLETED",
            Self::Failed => "FAILED",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SyncStatus {
    New,
    Matched,
    Conflict,
    Published,
    Skipped,
    Error,
}

impl SyncStatus {
    pub fn as_db_value(self) -> &'static str {
        match self {
            Self::New => "NEW",
            Self::Matched => "MATCHED",
            Self::Conflict => "CONFLICT",
            Self::Published => "PUBLISHED",
            Self::Skipped => "SKIPPED",
            Self::Error => "ERROR",
        }
    }
}

#[allow(dead_code)]
#[derive(Debug, Clone, Copy)]
pub enum ReviewAction {
    Pending,
    KeepRemote,
    UseScraped,
    Combine,
    Skip,
}

impl ReviewAction {
    pub fn as_db_value(self) -> &'static str {
        match self {
            Self::Pending => "PENDING",
            Self::KeepRemote => "KEEP_REMOTE",
            Self::UseScraped => "USE_SCRAPED",
            Self::Combine => "COMBINE",
            Self::Skip => "SKIP",
        }
    }
}

#[derive(Debug, Parser)]
#[command(author, version, about = "Scrapper local en Rust para nutrir la base colaborativa de kiosco24.")]
pub struct Cli {
    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Debug, Subcommand)]
pub enum Commands {
    Scan(ScanArgs),
    Compare(CompareArgs),
    Publish(PublishArgs),
    Review(ReviewArgs),
}

#[derive(Debug, Clone, Parser)]
pub struct ScanArgs {
    #[arg(long, value_enum)]
    pub source: ScraperSource,
    #[arg(long)]
    pub url: String,
    #[arg(long)]
    pub root_url: Option<String>,
    #[arg(long)]
    pub limit: Option<usize>,
    #[arg(long, default_value_t = false)]
    pub discover_categories: bool,
    #[arg(long)]
    pub max_categories: Option<usize>,
}

#[derive(Debug, Clone, Parser)]
pub struct CompareArgs {
    #[arg(long)]
    pub product_id: Option<String>,
    #[arg(long)]
    pub run_id: Option<String>,
}

#[derive(Debug, Clone, Parser)]
pub struct PublishArgs {
    #[arg(long)]
    pub product_id: String,
    #[arg(long, default_value_t = false)]
    pub force: bool,
}

#[derive(Debug, Clone, Parser)]
pub struct ReviewArgs {
    #[arg(long)]
    pub run_id: String,
    #[arg(long, default_value_t = false)]
    pub interactive: bool,
    #[arg(long, default_value_t = false)]
    pub open_html: bool,
    #[arg(long, default_value_t = false)]
    pub only_conflicts: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScrapedProductInput {
    pub barcode: Option<String>,
    pub name: String,
    pub brand: Option<String>,
    pub category_name: Option<String>,
    pub presentation: Option<String>,
    pub description: Option<String>,
    pub price_raw: Option<String>,
    pub image_source_url: Option<String>,
    pub image: Option<String>,
    pub source_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteMatchedVariant {
    pub id: String,
    pub name: String,
    pub barcode: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteProductSnapshot {
    pub id: String,
    pub barcode: Option<String>,
    pub name: String,
    pub brand: Option<String>,
    pub category_name: Option<String>,
    pub presentation: Option<String>,
    pub description: Option<String>,
    pub image: Option<String>,
    pub status: Option<String>,
    pub updated_at: Option<String>,
    pub matched_variant: Option<RemoteMatchedVariant>,
}

#[derive(Debug, Clone)]
pub struct CompareOutcome {
    pub sync_status: SyncStatus,
    pub remote_platform_product_id: Option<String>,
    pub remote_owner_type: Option<String>,
    pub remote_snapshot: Option<Value>,
    pub conflict_fields: Option<Value>,
}

#[derive(Debug, Clone)]
pub struct StageProductRecord {
    pub run_id: String,
    pub source: ScraperSource,
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
    pub compare_outcome: CompareOutcome,
}

#[allow(dead_code)]
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct ScrapedProductRow {
    pub id: String,
    #[sqlx(rename = "runId")]
    pub run_id: String,
    pub barcode: Option<String>,
    pub name: String,
    pub brand: Option<String>,
    #[sqlx(rename = "categoryName")]
    pub category_name: Option<String>,
    pub description: Option<String>,
    pub presentation: Option<String>,
    #[sqlx(rename = "priceRaw")]
    pub price_raw: Option<String>,
    pub image: Option<String>,
    #[sqlx(rename = "imageSourceUrl")]
    pub image_source_url: Option<String>,
    #[sqlx(rename = "sourceUrl")]
    pub source_url: Option<String>,
    #[sqlx(rename = "syncStatus")]
    pub sync_status: String,
    #[sqlx(rename = "reviewAction")]
    pub review_action: String,
    #[sqlx(rename = "reviewNote")]
    pub review_note: Option<String>,
    #[sqlx(rename = "remotePlatformProductId")]
    pub remote_platform_product_id: Option<String>,
    #[sqlx(rename = "remoteOwnerType")]
    pub remote_owner_type: Option<String>,
    #[sqlx(rename = "remoteSnapshot")]
    pub remote_snapshot: Option<Value>,
    #[sqlx(rename = "conflictFields")]
    pub conflict_fields: Option<Value>,
    #[sqlx(rename = "publishedAt")]
    pub published_at: Option<NaiveDateTime>,
    #[sqlx(rename = "createdAt")]
    pub created_at: NaiveDateTime,
    #[sqlx(rename = "updatedAt")]
    pub updated_at: NaiveDateTime,
}

#[allow(dead_code)]
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct ScrapeRunRow {
    pub id: String,
    pub source: String,
    #[sqlx(rename = "rootUrl")]
    pub root_url: Option<String>,
    #[sqlx(rename = "categoryUrl")]
    pub category_url: String,
    pub status: String,
    #[sqlx(rename = "errorMessage")]
    pub error_message: Option<String>,
    #[sqlx(rename = "startedAt")]
    pub started_at: NaiveDateTime,
    #[sqlx(rename = "finishedAt")]
    pub finished_at: Option<NaiveDateTime>,
}

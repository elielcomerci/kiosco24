use std::{env, path::PathBuf};

use anyhow::{Context, Result};

#[derive(Clone, Debug)]
pub struct AppConfig {
    pub database_url: String,
    pub kiosco24_base_url: String,
    pub platform_ingest_token: String,
    pub use_remote_api: bool,
    pub default_root_url: Option<String>,
    pub r2_endpoint: String,
    pub r2_bucket_name: String,
    pub r2_access_key_id: String,
    pub r2_secret_access_key: String,
    pub r2_public_base_url: String,
    pub scrape_delay_min_seconds: f64,
    pub scrape_delay_max_seconds: f64,
    pub review_output_dir: PathBuf,
}

impl AppConfig {
    pub fn load() -> Result<Self> {
        let project_root = load_env_files()?;

        let database_url = required_var("DATABASE_URL")?;
        let platform_ingest_token =
            env::var("KIOSCO24_PLATFORM_INGEST_TOKEN").ok().filter(|v| !v.trim().is_empty())
                .or_else(|| env::var("PLATFORM_INGEST_TOKEN").ok().filter(|v| !v.trim().is_empty()))
                .context("Falta PLATFORM_INGEST_TOKEN o KIOSCO24_PLATFORM_INGEST_TOKEN.")?;
        let use_remote_api = optional_bool("SCRAPER_USE_REMOTE_API", false);
        let default_root_url = env::var("SCRAPER_ROOT_URL")
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());

        let kiosco24_base_url = env::var("KIOSCO24_BASE_URL")
            .ok()
            .or_else(|| env::var("SCRAPER_KIOSCO24_BASE_URL").ok())
            .unwrap_or_else(|| "https://kiosco24.zap.com.ar".to_string());

        let r2_endpoint = required_var("R2_ENDPOINT")?;
        let r2_bucket_name = required_var("R2_BUCKET_NAME")?;
        let r2_access_key_id = required_var("R2_ACCESS_KEY_ID")?;
        let r2_secret_access_key = required_var("R2_SECRET_ACCESS_KEY")?;
        let r2_public_base_url = required_var("R2_PUBLIC_BASE_URL")?;
        let scrape_delay_min_seconds = optional_f64("SCRAPE_DELAY_MIN_SECONDS", 1.5);
        let scrape_delay_max_seconds = optional_f64("SCRAPE_DELAY_MAX_SECONDS", 3.0)
            .max(scrape_delay_min_seconds);
        let review_output_dir = project_root.join(
            env::var("SCRAPER_REVIEW_OUTPUT_DIR")
                .unwrap_or_else(|_| "tools/platform-scraper-rs/output".to_string()),
        );

        Ok(Self {
            database_url,
            kiosco24_base_url,
            platform_ingest_token,
            use_remote_api,
            default_root_url,
            r2_endpoint,
            r2_bucket_name,
            r2_access_key_id,
            r2_secret_access_key,
            r2_public_base_url,
            scrape_delay_min_seconds,
            scrape_delay_max_seconds,
            review_output_dir,
        })
    }
}

fn required_var(name: &str) -> Result<String> {
    env::var(name)
        .map(|value| value.trim().to_string())
        .with_context(|| format!("Falta la variable {name}."))
}

fn optional_f64(name: &str, fallback: f64) -> f64 {
    env::var(name)
        .ok()
        .and_then(|value| value.trim().parse::<f64>().ok())
        .unwrap_or(fallback)
}

fn optional_bool(name: &str, fallback: bool) -> bool {
    env::var(name)
        .ok()
        .and_then(|value| match value.trim().to_ascii_lowercase().as_str() {
            "1" | "true" | "yes" | "on" => Some(true),
            "0" | "false" | "no" | "off" => Some(false),
            _ => None,
        })
        .unwrap_or(fallback)
}

fn load_env_files() -> Result<PathBuf> {
    let mut current = env::current_dir().context("No pude leer el directorio actual.")?;
    let mut roots = Vec::new();
    let mut project_root = None;

    loop {
        roots.push(current.clone());
        if !current.pop() {
            break;
        }
    }

    // Cargamos de arriba hacia abajo para que el proyecto más cercano tenga prioridad.
    roots.reverse();
    for dir in roots {
        for file_name in [".env", ".env.local"] {
            let candidate = dir.join(file_name);
            if candidate.exists() {
                let _ = dotenvy::from_path_override(&candidate);
                project_root = Some(dir.clone());
            }
        }
    }

    Ok(project_root.unwrap_or(env::current_dir().context("No pude releer el directorio actual.")?))
}

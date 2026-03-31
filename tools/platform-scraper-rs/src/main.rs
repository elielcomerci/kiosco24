mod config;
mod db;
mod models;
mod normalize;
mod r2;
mod remote;
mod review;
mod scrapers;

use std::{
    collections::BTreeMap,
    io::{self, Write},
    path::PathBuf,
    process::Command,
};

use anyhow::{bail, Context, Result};
use clap::Parser;
use dialoguer::Select;
use serde_json::json;

use crate::{
    config::AppConfig,
    db::{
        connect, create_run, find_platform_match_by_barcode, finish_run, get_product, get_run,
        insert_scraped_product, list_run_products, mark_error, mark_keep_remote, mark_published,
        summarize_run, update_compare_outcome, upsert_platform_product_direct,
    },
    models::{
        Cli, Commands, CompareArgs, CompareOutcome, PublishArgs, ReviewArgs, RunStatus, ScanArgs,
        ScrapedProductInput, ScrapedProductRow, SyncStatus, StageProductRecord,
    },
    normalize::{
        build_content_hash, diff_against_remote, normalize_scraped_product, remote_snapshot_to_json,
    },
    r2::R2Storage,
    remote::Kiosco24Client,
    review::generate_review_html,
    scrapers::{carrefour::CarrefourScraper, coto::CotoScraper},
};

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    let config = AppConfig::load()?;
    let pool = connect(&config.database_url).await?;
    let remote = Kiosco24Client::new(
        config.kiosco24_base_url.clone(),
        config.platform_ingest_token.clone(),
    )?;

    match cli.command {
        Commands::Scan(args) => handle_scan(args, &config, &pool, &remote).await?,
        Commands::Compare(args) => handle_compare(args, &config, &pool, &remote).await?,
        Commands::Publish(args) => handle_publish(args, &config, &pool, &remote).await?,
        Commands::Review(args) => handle_review(args, &config, &pool, &remote).await?,
    }

    Ok(())
}

fn print_line(message: impl AsRef<str>) {
    println!("{}", message.as_ref());
    let _ = io::stdout().flush();
}

fn print_error(message: impl AsRef<str>) {
    eprintln!("{}", message.as_ref());
    let _ = io::stderr().flush();
}

async fn handle_scan(
    args: ScanArgs,
    config: &AppConfig,
    pool: &sqlx::PgPool,
    remote: &Kiosco24Client,
) -> Result<()> {
    let effective_root_url = args.root_url.clone().or_else(|| config.default_root_url.clone());
    let run_id = create_run(pool, args.source, &args.url, effective_root_url.as_deref()).await?;
    print_line(format!("Run creado: {run_id}"));

    let result: Result<BTreeMap<String, usize>> = async {
        let scan_args = args.clone();
        let scan_root_url = effective_root_url.clone();
        let min_delay = config.scrape_delay_min_seconds;
        let max_delay = config.scrape_delay_max_seconds;
        let scraped_products = tokio::task::spawn_blocking(move || match scan_args.source {
            models::ScraperSource::Carrefour => {
                let scraper = CarrefourScraper::new(min_delay, max_delay);
                scraper.scan(
                    &scan_args.url,
                    scan_root_url.as_deref(),
                    scan_args.limit,
                    scan_args.discover_categories,
                    scan_args.max_categories,
                )
            }
            models::ScraperSource::Coto => {
                let scraper = CotoScraper::new(min_delay, max_delay);
                scraper.scan(&scan_args.url, scan_root_url.as_deref(), scan_args.limit)
            }
        })
        .await
        .context("El hilo de scraping se interrumpió.")??;

        let storage = R2Storage::new(config).await?;
        let mut counters = BTreeMap::<String, usize>::new();

        for raw_product in scraped_products {
            let mut product = normalize_scraped_product(&raw_product);
            if product.image.is_none() {
                if let Some(image_source_url) = product.image_source_url.clone() {
                    match storage
                        .localize_remote_image(
                            &image_source_url,
                            product.barcode.as_deref(),
                            &product.name,
                        )
                        .await
                    {
                        Ok(localized) => product.image = Some(localized),
                        Err(error) => {
                            print_error(format!(
                                "  ! No pude localizar imagen para {}: {}",
                                product.name, error
                            ))
                        }
                    }
                }
            }

            let compare_outcome = compare_product(config, pool, remote, &product).await?;

            let record = StageProductRecord {
                run_id: run_id.clone(),
                source: args.source,
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
                content_hash: Some(build_content_hash(&product)),
                compare_outcome,
            };

            let staged_id = insert_scraped_product(pool, &record).await?;
            print_line(format!(
                "__SCRAPER_EVENT__{}",
                json!({
                    "type": "staged_product",
                    "id": staged_id,
                    "name": record.name,
                    "barcode": record.barcode,
                    "brand": record.brand,
                    "categoryName": record.category_name,
                    "presentation": record.presentation,
                    "image": record.image,
                    "sourceUrl": record.source_url,
                    "syncStatus": record.compare_outcome.sync_status.as_db_value(),
                })
            ));
            *counters
                .entry(record.compare_outcome.sync_status.as_db_value().to_string())
                .or_insert(0) += 1;
        }

        Ok(counters)
    }
    .await;

    match result {
        Ok(counters) => {
            finish_run(pool, &run_id, RunStatus::Completed, None).await?;
            print_line(format!("Run {run_id} completo."));
            for (status, total) in counters {
                print_line(format!("  - {status}: {total}"));
            }
        }
        Err(error) => {
            finish_run(pool, &run_id, RunStatus::Failed, Some(&error.to_string())).await?;
            return Err(error);
        }
    }

    Ok(())
}

async fn handle_compare(
    args: CompareArgs,
    config: &AppConfig,
    pool: &sqlx::PgPool,
    remote: &Kiosco24Client,
) -> Result<()> {
    let rows = if let Some(product_id) = args.product_id.as_deref() {
        vec![get_product(pool, product_id).await?]
    } else if let Some(run_id) = args.run_id.as_deref() {
        list_run_products(pool, run_id, false).await?
    } else {
        bail!("Indicá --product-id o --run-id.");
    };

    for row in rows {
        let product = row_to_input(&row);
        match compare_product(config, pool, remote, &product).await {
            Ok(outcome) => {
                update_compare_outcome(pool, &row.id, &outcome).await?;
                print_line(format!("{} -> {}", row.name, outcome.sync_status.as_db_value()));
            }
            Err(error) => {
                mark_error(pool, &row.id, &format!("Error al comparar: {error}")).await?;
                print_error(format!("{} -> error {}", row.name, error));
            }
        }
    }

    Ok(())
}

async fn handle_publish(
    args: PublishArgs,
    config: &AppConfig,
    pool: &sqlx::PgPool,
    remote: &Kiosco24Client,
) -> Result<()> {
    let row = get_product(pool, &args.product_id).await?;
    if row.sync_status == SyncStatus::Conflict.as_db_value() && !args.force {
        bail!(
            "El producto está en conflicto. Revisalo primero o usá --force si querés publicar igual."
        );
    }

    let product = row_to_input(&row);
    let response = publish_product(config, pool, remote, &product).await?;

    print_line(format!(
        "Publicado {} -> {}",
        response.product.name, response.product.id
    ));
    mark_published(pool, &row.id, Some(&response.product.id)).await?;

    Ok(())
}

async fn handle_review(
    args: ReviewArgs,
    config: &AppConfig,
    pool: &sqlx::PgPool,
    remote: &Kiosco24Client,
) -> Result<()> {
    let run = get_run(pool, &args.run_id).await?;
    let products = list_run_products(pool, &args.run_id, args.only_conflicts).await?;
    let report_path = generate_review_html(&run, &products, &config.review_output_dir)?;
    let summary = summarize_run(pool, &args.run_id).await?;

    print_line(format!("Reporte generado: {}", report_path.display()));
    for (status, total) in summary {
        print_line(format!("  - {status}: {total}"));
    }

    if args.open_html {
        open_html_report(&report_path)?;
    }

    if args.interactive {
        for row in products
            .iter()
            .filter(|row| matches!(row.sync_status.as_str(), "CONFLICT" | "NEW" | "MATCHED"))
        {
            print_line(format!("\n{}", "=".repeat(72)));
            print_row_summary(row);
            let selection = Select::new()
                .with_prompt("¿Qué querés hacer con este producto?")
                .items([
                    "Usar scrapeado y publicar",
                    "Mantener actual",
                    "Saltar por ahora",
                ])
                .default(2)
                .interact()?;

            match selection {
                0 => {
                    let response = publish_product(config, pool, remote, &row_to_input(row)).await?;
                    mark_published(pool, &row.id, Some(&response.product.id)).await?;
                    print_line(format!("Publicado {}", row.name));
                }
                1 => {
                    mark_keep_remote(pool, &row.id, Some("Resuelto en review interactiva.")).await?;
                    print_line("Se mantiene la versión actual.");
                }
                _ => {
                    print_line("Se deja pendiente.");
                }
            }
        }
    }

    Ok(())
}

fn row_to_input(row: &ScrapedProductRow) -> ScrapedProductInput {
    ScrapedProductInput {
        barcode: row.barcode.clone(),
        name: row.name.clone(),
        brand: row.brand.clone(),
        category_name: row.category_name.clone(),
        presentation: row.presentation.clone(),
        description: row.description.clone(),
        price_raw: row.price_raw.clone(),
        image_source_url: row.image_source_url.clone(),
        image: row.image.clone(),
        source_url: row.source_url.clone(),
    }
}

async fn compare_via_database(
    pool: &sqlx::PgPool,
    product: &ScrapedProductInput,
) -> Result<CompareOutcome> {
    let Some(barcode) = product.barcode.as_deref() else {
        return Ok(CompareOutcome {
            sync_status: SyncStatus::New,
            remote_platform_product_id: None,
            remote_owner_type: None,
            remote_snapshot: None,
            conflict_fields: None,
        });
    };

    let Some((owner_type, remote)) = find_platform_match_by_barcode(pool, barcode).await? else {
        return Ok(CompareOutcome {
            sync_status: SyncStatus::New,
            remote_platform_product_id: None,
            remote_owner_type: None,
            remote_snapshot: None,
            conflict_fields: None,
        });
    };

    let diff_fields = diff_against_remote(product, &remote);

    Ok(CompareOutcome {
        sync_status: if diff_fields.is_empty() {
            SyncStatus::Matched
        } else {
            SyncStatus::Conflict
        },
        remote_platform_product_id: Some(remote.id.clone()),
        remote_owner_type: Some(owner_type),
        remote_snapshot: Some(remote_snapshot_to_json(&remote)),
        conflict_fields: if diff_fields.is_empty() {
            None
        } else {
            Some(json!(diff_fields))
        },
    })
}

async fn compare_product(
    config: &AppConfig,
    pool: &sqlx::PgPool,
    remote: &Kiosco24Client,
    product: &ScrapedProductInput,
) -> Result<CompareOutcome> {
    if config.use_remote_api {
        match remote.compare_barcode(product).await {
            Ok(outcome) => return Ok(outcome),
            Err(error) => {
                print_error(format!(
                    "  ! Falló la comparación remota para {}: {}. Intento directo contra Neon...",
                    product.name, error
                ));
            }
        }
    }

    compare_via_database(pool, product).await
}

async fn publish_product(
    config: &AppConfig,
    pool: &sqlx::PgPool,
    remote: &Kiosco24Client,
    product: &ScrapedProductInput,
) -> Result<remote::PublishResponse> {
    if config.use_remote_api {
        match remote.publish_product(product).await {
            Ok(response) => return Ok(response),
            Err(error) => {
                print_error(format!(
                    "No pude publicar vía endpoint de kiosco24: {}. Hago upsert directo en Neon...",
                    error
                ));
            }
        }
    }

    let published = upsert_platform_product_direct(pool, product).await?;
    Ok(remote::PublishResponse {
        localized_image: product.image.clone(),
        product: published,
    })
}

fn print_row_summary(row: &ScrapedProductRow) {
    print_line(format!("Producto: {}", row.name));
    print_line(format!(
        "Barcode: {}",
        row.barcode.as_deref().unwrap_or("(sin barcode)")
    ));
    print_line(format!("Estado: {}", row.sync_status));
    print_line(format!(
        "Imagen scrapeada: {}",
        row.image.as_deref().unwrap_or("—")
    ));
    if let Some(remote_snapshot) = row.remote_snapshot.as_ref() {
        print_line(format!(
            "Imagen actual: {}",
            remote_snapshot
                .get("image")
                .and_then(|value| value.as_str())
                .unwrap_or("—")
        ));
        print_line(format!(
            "Nombre actual: {}",
            remote_snapshot
                .get("name")
                .and_then(|value| value.as_str())
                .unwrap_or("—")
        ));
    }
    if let Some(conflicts) = row.conflict_fields.as_ref().and_then(|value| value.as_array()) {
        let labels = conflicts
            .iter()
            .filter_map(|entry| entry.as_str())
            .collect::<Vec<_>>()
            .join(", ");
        if !labels.is_empty() {
            print_line(format!("Conflictos: {labels}"));
        }
    }
}

fn open_html_report(path: &PathBuf) -> Result<()> {
    Command::new("cmd")
        .args(["/C", "start", "", &path.display().to_string()])
        .spawn()
        .context("No pude abrir el reporte HTML.")?;
    Ok(())
}

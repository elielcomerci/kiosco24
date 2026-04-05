mod buffer;
mod config;
mod db;
mod models;
mod normalize;
mod r2;
mod remote;
mod review;
mod scrapers;

use std::{
    collections::{BTreeMap, VecDeque},
    io::{self, Write},
    path::PathBuf,
    process::Command,
    time::Duration,
};

use anyhow::{bail, Context, Result};
use clap::Parser;
use dialoguer::Select;
use serde_json::json;
use tokio::sync::mpsc;

use crate::{
    buffer::{
        BufferedProduct, LocalBuffer, ScanProgressCheckpoint, checkpoint_path_for_buffer,
        cleanup_buffer_file, cleanup_scan_progress_checkpoint, read_buffer_checkpoint,
        read_buffer_file_from, read_buffer_source_urls, read_scan_progress_checkpoint,
        scan_progress_path_for_run, write_buffer_checkpoint, write_scan_progress_checkpoint,
    },
    config::AppConfig,
    db::{
        connect, create_run, fetch_last_known_prices, find_platform_match_by_barcode, finish_run, get_product, get_run,
        insert_scraped_product, list_run_products, mark_error, mark_keep_remote, mark_published,
        mark_skipped, resume_run, summarize_run, update_compare_outcome,
        upsert_platform_product_direct,
    },
    models::{
        Cli, Commands, CompareArgs, CompareOutcome, FlushArgs, PublishArgs, ResolveSafeArgs,
        ReviewAction, ReviewArgs, RunStatus, ScanArgs, ScanResumePosition, ScanStreamMessage,
        ScrapedProductInput, ScrapedProductRow, ScraperSource, StageProductRecord, SyncStatus,
    },
    normalize::{
        build_content_hash, diff_against_remote, normalize_scraped_product,
        normalize_source_url, remote_snapshot_to_json,
    },
    r2::R2Storage,
    remote::Kiosco24Client,
    review::generate_review_html,
    scrapers::{carrefour::CarrefourScraper, coto::CotoScraper, pricely::PricelyScraper},
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
        Commands::ResolveSafe(args) => handle_resolve_safe(args, &config, &pool, &remote).await?,
        Commands::Review(args) => handle_review(args, &config, &pool, &remote).await?,
        Commands::Flush(args) => handle_flush(args, &config, &pool, &remote).await?,
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

fn emit_staged_product_event(product: &BufferedProduct, sync_status: &str) {
    print_line(format!(
        "__SCRAPER_EVENT__{}",
        json!({
            "type": "staged_product",
            "id": product.id,
            "businessActivity": product.business_activity,
            "name": product.name,
            "barcode": product.barcode,
            "brand": product.brand,
            "categoryName": product.category_name,
            "presentation": product.presentation,
            "image": product.image,
            "sourceUrl": product.source_url,
            "syncStatus": sync_status,
        })
    ));
}

fn buffered_to_input(product: &BufferedProduct) -> ScrapedProductInput {
    ScrapedProductInput {
        barcode: product.barcode.clone(),
        name: product.name.clone(),
        brand: product.brand.clone(),
        category_name: product.category_name.clone(),
        presentation: product.presentation.clone(),
        description: product.description.clone(),
        price_raw: product.price_raw.clone(),
        image_source_url: product.image_source_url.clone(),
        image: product.image.clone(),
        source_url: product.source_url.clone(),
    }
}

async fn stage_buffered_product(
    config: &AppConfig,
    pool: &sqlx::PgPool,
    remote: &Kiosco24Client,
    product: &BufferedProduct,
) -> Result<SyncStatus> {
    let source = ScraperSource::from_db_value(product.source.as_str()).with_context(|| {
        format!(
            "Fuente de scraper no soportada en buffer: {}",
            product.source
        )
    })?;
    let input = buffered_to_input(product);
    let compare_outcome = compare_product(config, pool, remote, &input).await?;

    let record = StageProductRecord {
        id: product.id.clone(),
        run_id: product.run_id.clone(),
        business_activity: product.business_activity.clone(),
        source,
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
        content_hash: product.content_hash.clone(),
        compare_outcome: compare_outcome.clone(),
    };

    insert_scraped_product(pool, &record).await?;
    Ok(compare_outcome.sync_status)
}

async fn try_stage_buffered_product(
    config: &AppConfig,
    pool: &sqlx::PgPool,
    remote: &Kiosco24Client,
    product: &BufferedProduct,
) -> Result<SyncStatus> {
    let mut last_error = None;

    for attempt in 1..=3 {
        match stage_buffered_product(config, pool, remote, product).await {
            Ok(sync_status) => return Ok(sync_status),
            Err(error) => {
                print_error(format!(
                    "  ! {} (intento {}/3): {}",
                    product.name, attempt, error
                ));
                last_error = Some(error.to_string());
                if attempt < 3 {
                    tokio::time::sleep(Duration::from_millis(1000 * 2u64.pow(attempt as u32 - 1))).await;
                }
            }
        }
    }

    bail!(
        "{}",
        last_error.unwrap_or_else(|| "No pude stagear el producto.".to_string())
    )
}

async fn flush_pending_queue(
    config: &AppConfig,
    pool: &sqlx::PgPool,
    remote: &Kiosco24Client,
    buffer: &mut LocalBuffer,
    pending_queue: &mut VecDeque<BufferedProduct>,
    counters: &mut BTreeMap<String, usize>,
    batch_size: usize,
    reason: &str,
) -> Result<usize> {
    let target = pending_queue.len().min(batch_size);
    if target == 0 {
        return Ok(0);
    }

    print_line(format!(
        "Cargando lote ({reason}) de hasta {target} productos. Checkpoint: {}/{}",
        buffer.flushed_count(),
        buffer.count()
    ));

    let mut flushed = 0usize;

    for _ in 0..target {
        let Some(product) = pending_queue.front().cloned() else {
            break;
        };

        match try_stage_buffered_product(config, pool, remote, &product).await {
            Ok(sync_status) => {
                buffer.mark_flushed(1).await?;
                pending_queue.pop_front();
                *counters
                    .entry(sync_status.as_db_value().to_string())
                    .or_insert(0) += 1;
                emit_staged_product_event(&product, sync_status.as_db_value());
                flushed += 1;
            }
            Err(error) => {
                print_error(format!(
                    "  ! {} queda pendiente en buffer: {}",
                    product.name, error
                ));
                break;
            }
        }
    }

    if flushed > 0 {
        print_line(format!(
            "Lote cargado ({reason}): {flushed}. Checkpoint actualizado: {}/{}",
            buffer.flushed_count(),
            buffer.count()
        ));
    }

    Ok(flushed)
}

async fn handle_scan(
    args: ScanArgs,
    config: &AppConfig,
    pool: &sqlx::PgPool,
    remote: &Kiosco24Client,
) -> Result<()> {
    if args.stage_batch_size == 0 {
        bail!("IndicÃ¡ un --stage-batch-size mayor a 0.");
    }

    if args.resume_page_number.is_some() && args.resume_category_url.is_none() {
        bail!("Si usÃ¡s --resume-page-number, tambiÃ©n tenÃ©s que indicar --resume-category-url.");
    }

    let manual_resume_position = args.resume_category_url.clone().map(|category_url| ScanResumePosition {
        category_url,
        next_page_number: args.resume_page_number.unwrap_or(1).max(1),
    });

    let output_dir = PathBuf::from(&config.review_output_dir);
    let requested_root_url = args.root_url.clone().or_else(|| config.default_root_url.clone());
    let requested_business_activity = args.business_activity.trim().to_uppercase();
    let (
        run_id,
        scan_url,
        effective_business_activity,
        effective_root_url,
        scan_progress_path,
        mut scan_progress,
        resume_position,
    ) = if let Some(resume_run_id) = args.resume_run_id.as_deref() {
        let run = get_run(pool, resume_run_id).await?;
        if run.source != args.source.as_db_value() {
            bail!(
                "El run {} pertenece a {} y no coincide con el scraper solicitado {}.",
                resume_run_id,
                run.source,
                args.source.as_db_value()
            );
        }

        let effective_root_url = run
            .root_url
            .clone()
            .or_else(|| requested_root_url.clone());
        let effective_business_activity = run.business_activity.trim().to_uppercase();
        let scan_progress_path = scan_progress_path_for_run(&output_dir, resume_run_id);
        let mut scan_progress = read_scan_progress_checkpoint(&scan_progress_path)
            .await?
            .unwrap_or_else(|| {
                ScanProgressCheckpoint::new(
                    resume_run_id,
                    args.source,
                    &run.category_url,
                    effective_root_url.as_deref(),
                )
            });
        scan_progress.root_url = effective_root_url.clone();
        let resume_position = manual_resume_position.clone().or_else(|| {
            scan_progress
                .last_completed_category_url
                .clone()
                .zip(scan_progress.last_completed_page_number)
                .map(|(category_url, page_number)| ScanResumePosition {
                    category_url,
                    next_page_number: page_number.saturating_add(1),
                })
        });

        resume_run(pool, resume_run_id).await?;
        write_scan_progress_checkpoint(&scan_progress_path, &scan_progress).await?;
        print_line(format!("Run reanudado: {resume_run_id}"));

        (
            resume_run_id.to_string(),
            run.category_url,
            effective_business_activity,
            effective_root_url,
            scan_progress_path,
            scan_progress,
            resume_position,
        )
    } else {
        let run_id = create_run(
            pool,
            args.source,
            &requested_business_activity,
            &args.url,
            requested_root_url.as_deref(),
        )
        .await?;
        let scan_progress_path = scan_progress_path_for_run(&output_dir, &run_id);
        let scan_progress = ScanProgressCheckpoint::new(
            &run_id,
            args.source,
            &args.url,
            requested_root_url.as_deref(),
        );
        write_scan_progress_checkpoint(&scan_progress_path, &scan_progress).await?;
        print_line(format!("Run creado: {run_id}"));

        (
            run_id,
            args.url.clone(),
            requested_business_activity,
            requested_root_url,
            scan_progress_path,
            scan_progress,
            manual_resume_position,
        )
    };

    let mut buffer = LocalBuffer::new(&output_dir, &run_id).await?;
    let buffer_path = buffer.path().clone();
    let checkpoint_path = buffer.checkpoint_path().clone();
    print_line(format!("Buffer local: {}", buffer_path.display()));
    print_line(format!("Checkpoint local: {}", checkpoint_path.display()));
    print_line(format!(
        "Checkpoint de scan: {}",
        scan_progress_path.display()
    ));
    print_line(format!("Rubro operativo del run: {}", effective_business_activity));
    if let Some(resume) = resume_position.as_ref() {
        print_line(format!(
            "Retomando scan desde categoria {} pagina {}.",
            resume.category_url, resume.next_page_number
        ));
    }

    let mut buffered_source_urls = read_buffer_source_urls(&buffer_path).await?;
    if !buffered_source_urls.is_empty() {
        print_line(format!(
            "Productos ya presentes en buffer: {}",
            buffered_source_urls.len()
        ));
    }

    let (tx, mut rx) = mpsc::unbounded_channel();
    let scan_args = args.clone();
    let scan_root_url = effective_root_url.clone();
    let scan_url = scan_url.clone();
    let resume_position_for_scan = resume_position.clone();
    let min_delay = config.scrape_delay_min_seconds;
    let max_delay = config.scrape_delay_max_seconds;

    let scan_handle = tokio::task::spawn_blocking(move || -> Result<usize> {
        match scan_args.source {
            models::ScraperSource::Carrefour => {
                let scraper = CarrefourScraper::new(min_delay, max_delay);
                let product_tx = tx.clone();
                let page_tx = tx.clone();
                scraper.scan_with_handler(
                    &scan_url,
                    scan_root_url.as_deref(),
                    scan_args.limit,
                    scan_args.discover_categories,
                    scan_args.max_categories,
                    resume_position_for_scan,
                    |page_progress| {
                        page_tx
                            .send(ScanStreamMessage::PageCompleted(page_progress))
                            .map_err(|_| anyhow::anyhow!("Se cerrÃ³ el canal de progreso del scan."))
                    },
                    |product| {
                        product_tx
                            .send(ScanStreamMessage::Product(product))
                            .map_err(|_| anyhow::anyhow!("Se cerrÃ³ el canal de procesamiento del scan."))
                    },
                )
            }
            models::ScraperSource::Coto => {
                let scraper = CotoScraper::new(min_delay, max_delay);
                let product_tx = tx.clone();
                scraper.scan_with_handler(
                    &scan_url,
                    scan_root_url.as_deref(),
                    scan_args.limit,
                    |product| {
                        product_tx
                            .send(ScanStreamMessage::Product(product))
                            .map_err(|_| anyhow::anyhow!("Se cerrÃ³ el canal de procesamiento del scan."))
                    },
                )
            }
            models::ScraperSource::Pricely => {
                let scraper = PricelyScraper::new(min_delay, max_delay);
                let product_tx = tx.clone();
                let page_tx = tx.clone();
                scraper.scan_with_handler(
                    &scan_url,
                    scan_root_url.as_deref(),
                    scan_args.limit,
                    resume_position_for_scan,
                    |page_progress| {
                        page_tx
                            .send(ScanStreamMessage::PageCompleted(page_progress))
                            .map_err(|_| anyhow::anyhow!("Se cerró el canal de progreso del scan."))
                    },
                    |product| {
                        product_tx
                            .send(ScanStreamMessage::Product(product))
                            .map_err(|_| anyhow::anyhow!("Se cerró el canal de procesamiento del scan."))
                    },
                )
            }
        }
    });

    let storage = R2Storage::new(config).await?;
    let mut counters = BTreeMap::<String, usize>::new();
    let mut buffered_total = 0usize;
    let mut pending_queue = VecDeque::<BufferedProduct>::new();

    // Load last known prices from DB
    let last_known_prices = match fetch_last_known_prices(pool).await {
        Ok(prices) => {
            print_line(format!("Precios conocidos cargados: {} barcodes.", prices.len()));
            prices
        }
        Err(error) => {
            print_error(format!("No se pudieron cargar precios conocidos: {}", error));
            BTreeMap::new()
        }
    };

    let last_known_prices_for_scan = last_known_prices.clone();

    let processing_result: Result<()> = async {
        while let Some(message) = rx.recv().await {
            match message {
                ScanStreamMessage::PageCompleted(progress) => {
                    scan_progress.update_page(
                        &progress.category_url,
                        &progress.page_url,
                        progress.page_number,
                    );
                    write_scan_progress_checkpoint(&scan_progress_path, &scan_progress).await?;
                    print_line(format!(
                        "Checkpoint de scan actualizado: {} pagina {}",
                        progress.category_url, progress.page_number
                    ));
                }
                ScanStreamMessage::Product(raw_product) => {
                    if let Some(source_url) = raw_product.source_url.as_deref() {
                        if let Some(normalized_source_url) = normalize_source_url(Some(source_url))
                        {
                            if !buffered_source_urls.insert(normalized_source_url) {
                                print_line(format!(
                                    "  - Ya estaba en buffer, se omite duplicado: {}",
                                    raw_product.name
                                ));
                                continue;
                            }
                        }
                    }

                    let mut product = normalize_scraped_product(&raw_product);

                    // Fill price from last known if not present
                    if product.price_raw.is_none() {
                        if let Some(barcode) = &product.barcode {
                            if let Some(known_price) = last_known_prices_for_scan.get(barcode) {
                                product.price_raw = Some(known_price.clone());
                            }
                        }
                    }

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
                                Err(_error) => {
                                    // Skip silently - don't fail scan for missing images
                                }
                            }
                        }
                    }

                    let buffered = BufferedProduct::from_input(
                        &run_id,
                        &effective_business_activity,
                        args.source,
                        &product,
                        Some(build_content_hash(&product)),
                    );

                    buffer.write(&buffered).await?;
                    buffered_total += 1;
                    pending_queue.push_back(buffered);

                    while pending_queue.len() >= args.stage_batch_size {
                        let flushed = flush_pending_queue(
                            config,
                            pool,
                            remote,
                            &mut buffer,
                            &mut pending_queue,
                            &mut counters,
                            args.stage_batch_size,
                            "scan incremental",
                        )
                        .await?;
                        if flushed == 0 {
                            break;
                        }
                    }
                }
            }
        }

        Ok(())
    }
    .await;

    let scan_result = match scan_handle.await {
        Ok(result) => result,
        Err(error) => Err(anyhow::anyhow!("El hilo de scraping se interrumpiÃ³: {error}")),
    };

    if processing_result.is_ok() {
        while !pending_queue.is_empty() {
            let flushed = flush_pending_queue(
                config,
                pool,
                remote,
                &mut buffer,
                &mut pending_queue,
                &mut counters,
                args.stage_batch_size,
                "scan final",
            )
            .await?;
            if flushed == 0 {
                break;
            }
        }
    }

    let staged_total = buffer.flushed_count();
    let pending_total = buffer.pending_count();
    drop(buffer);

    match (processing_result, scan_result) {
        (Ok(()), Ok(scraped_total)) => {
            finish_run(pool, &run_id, RunStatus::Completed, None).await?;
            cleanup_scan_progress_checkpoint(&scan_progress_path).await?;
            print_line(format!("Run {run_id} completo."));
            print_line(format!("Productos scrapeados: {scraped_total}"));
            print_line(format!("Productos bufferizados: {buffered_total}"));
            print_line(format!("Productos cargados a staging interno: {staged_total}"));
            print_line("Todavia no se publicaron en la base colaborativa.");
            if pending_total > 0 {
                print_line(format!("Pendientes de flush: {pending_total}"));
                print_line("El buffer quedÃ³ listo para retomar la carga sin perder progreso.");
            }
            print_line(format!("Archivo: {}", buffer_path.display()));
            print_line(format!(
                "UsÃ¡ 'cargo run -- resolve-safe --run-id {run_id}' cuando quieras publicar en la base colaborativa los nuevos y omitir coincidencias exactas."
            ));
            print_line("UsÃ¡ 'cargo run -- flush --buffer-path <archivo>' para completar o reintentar la carga a la DB.");
            for (status, total) in counters {
                print_line(format!("  - {status}: {total}"));
            }
        }
        (processing_result, scan_result) => {
            let error = processing_result
                .err()
                .or_else(|| scan_result.err())
                .unwrap_or_else(|| anyhow::anyhow!("El scan terminÃ³ con un error no especificado."));
            finish_run(pool, &run_id, RunStatus::Failed, Some(&error.to_string())).await?;
            print_line(format!("Buffer guardado en: {}", buffer_path.display()));
            print_line(format!("Checkpoint guardado en: {}", checkpoint_path.display()));
            print_line(format!(
                "Checkpoint de scan guardado en: {}",
                scan_progress_path.display()
            ));
            print_line(format!("Productos bufferizados hasta el corte: {buffered_total}"));
            print_line(format!("Productos ya cargados a staging: {staged_total}"));
            print_line(format!("Pendientes de flush: {pending_total}"));
            print_line("Los productos scrapeados estÃ¡n seguros en el buffer local.");
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
        bail!("IndicÃ¡ --product-id o --run-id.");
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
            "El producto estÃ¡ en conflicto. Revisalo primero o usÃ¡ --force si querÃ©s publicar igual."
        );
    }

    let product = row_to_input(&row);
    let response = publish_product(config, pool, remote, &product, &row.business_activity).await?;

    print_line(format!(
        "Publicado {} -> {}",
        response.product.name, response.product.id
    ));
    mark_published(pool, &row.id, Some(&response.product.id)).await?;

    Ok(())
}

fn is_pending_scraped_product(row: &ScrapedProductRow) -> bool {
    row.review_action == ReviewAction::Pending.as_db_value()
        && matches!(row.sync_status.as_str(), "NEW" | "MATCHED" | "CONFLICT")
}

async fn handle_resolve_safe(
    args: ResolveSafeArgs,
    config: &AppConfig,
    pool: &sqlx::PgPool,
    remote: &Kiosco24Client,
) -> Result<()> {
    let rows = list_run_products(pool, &args.run_id, false).await?;
    let pending_rows: Vec<_> = rows.into_iter().filter(is_pending_scraped_product).collect();

    if pending_rows.is_empty() {
        print_line("No hay productos pendientes aptos para resolver automaticamente.");
        for (status, total) in summarize_run(pool, &args.run_id).await? {
            print_line(format!("  - {status}: {total}"));
        }
        return Ok(());
    }

    let mut published = 0usize;
    let mut skipped = 0usize;
    let mut review_required = 0usize;
    let mut compare_errors = 0usize;
    let mut publish_errors = 0usize;

    for row in pending_rows {
        let product = row_to_input(&row);
        let outcome = match compare_product(config, pool, remote, &product).await {
            Ok(outcome) => outcome,
            Err(error) => {
                compare_errors += 1;
                review_required += 1;
                print_error(format!(
                    "{} queda pendiente porque no pude compararlo automaticamente: {}",
                    row.name, error
                ));
                continue;
            }
        };

        update_compare_outcome(pool, &row.id, &outcome).await?;

        match outcome.sync_status {
            SyncStatus::Matched => {
                mark_skipped(
                    pool,
                    &row.id,
                    ReviewAction::Skip,
                    Some("Omitido automaticamente: coincide con la ficha colaborativa actual."),
                    outcome.remote_platform_product_id.as_deref(),
                    outcome.remote_owner_type.as_deref(),
                )
                .await?;
                skipped += 1;
                print_line(format!("{} -> SKIPPED (sin cambios)", row.name));
            }
            SyncStatus::New => {
                if product.barcode.is_none() {
                    review_required += 1;
                    print_error(format!(
                        "{} queda pendiente porque no tiene barcode para publicar en automatico.",
                        row.name
                    ));
                    continue;
                }

                match publish_product(config, pool, remote, &product, &row.business_activity).await {
                    Ok(response) => {
                        mark_published(pool, &row.id, Some(&response.product.id)).await?;
                        published += 1;
                        print_line(format!(
                            "{} -> PUBLISHED ({})",
                            response.product.name, response.product.id
                        ));
                    }
                    Err(error) => {
                        publish_errors += 1;
                        review_required += 1;
                        print_error(format!(
                            "{} queda pendiente porque no pude publicarlo automaticamente: {}",
                            row.name, error
                        ));
                    }
                }
            }
            SyncStatus::Conflict => {
                review_required += 1;
                print_line(format!("{} -> CONFLICT (requiere revision)", row.name));
            }
            SyncStatus::Published | SyncStatus::Skipped | SyncStatus::Error => {}
        }
    }

    print_line(format!(
        "Resolucion segura: {published} publicados, {skipped} omitidos sin cambios, {review_required} pendientes para revision."
    ));
    if compare_errors > 0 || publish_errors > 0 {
        print_error(format!(
            "Errores durante la resolucion automatica: {compare_errors} de comparacion, {publish_errors} de publicacion."
        ));
    }
    for (status, total) in summarize_run(pool, &args.run_id).await? {
        print_line(format!("  - {status}: {total}"));
    }

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
    let admin_review_url = build_scraper_admin_url(&config.kiosco24_base_url, &run.id, &run.business_activity);
    let report_path = generate_review_html(
        &run,
        &products,
        &config.review_output_dir,
        Some(&admin_review_url),
    )?;
    let summary = summarize_run(pool, &args.run_id).await?;

    print_line(format!("Reporte generado: {}", report_path.display()));
    print_line(format!("Editor admin: {admin_review_url}"));
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
                .with_prompt("Â¿QuÃ© querÃ©s hacer con este producto?")
                .items([
                    "Usar scrapeado y publicar",
                    "Mantener actual",
                    "Saltar por ahora",
                ])
                .default(2)
                .interact()?;

            match selection {
                0 => {
                    let response = publish_product(
                        config,
                        pool,
                        remote,
                        &row_to_input(row),
                        &row.business_activity,
                    )
                    .await?;
                    mark_published(pool, &row.id, Some(&response.product.id)).await?;
                    print_line(format!("Publicado {}", row.name));
                }
                1 => {
                    mark_keep_remote(pool, &row.id, Some("Resuelto en review interactiva.")).await?;
                    print_line("Se mantiene la versiÃ³n actual.");
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
                    "  ! FallÃ³ la comparaciÃ³n remota para {}: {}. Intento directo contra Neon...",
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
    business_activity: &str,
) -> Result<remote::PublishResponse> {
    if config.use_remote_api {
        match remote.publish_product(product).await {
            Ok(response) => return Ok(response),
            Err(error) => {
                print_error(format!(
                    "No pude publicar vÃ­a endpoint de kiosco24: {}. Hago upsert directo en Neon...",
                    error
                ));
            }
        }
    }

    let published = upsert_platform_product_direct(pool, product, business_activity).await?;
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
        row.image.as_deref().unwrap_or("â€”")
    ));
    if let Some(remote_snapshot) = row.remote_snapshot.as_ref() {
        print_line(format!(
            "Imagen actual: {}",
            remote_snapshot
                .get("image")
                .and_then(|value| value.as_str())
                .unwrap_or("â€”")
        ));
        print_line(format!(
            "Nombre actual: {}",
            remote_snapshot
                .get("name")
                .and_then(|value| value.as_str())
                .unwrap_or("â€”")
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

async fn handle_flush(
    args: FlushArgs,
    config: &AppConfig,
    pool: &sqlx::PgPool,
    remote: &Kiosco24Client,
) -> Result<()> {
    if args.batch_size == 0 {
        bail!("Indicá un --batch-size mayor a 0.");
    }

    let buffer_path = if let Some(path) = args.buffer_path {
        PathBuf::from(path)
    } else {
        let output_dir = PathBuf::from(&config.review_output_dir);
        let mut entries: Vec<_> = std::fs::read_dir(&output_dir)
            .with_context(|| format!("No pude leer el directorio: {}", output_dir.display()))?
            .filter_map(|e| e.ok())
            .filter(|e| {
                let file_name = e.file_name();
                let name = file_name.to_string_lossy();
                name.starts_with("buffer-") && name.ends_with(".jsonl")
            })
            .collect();

        entries.sort_by(|a, b| {
            let a_meta = a.metadata().ok();
            let b_meta = b.metadata().ok();
            let a_time = a_meta.and_then(|m| m.modified().ok());
            let b_time = b_meta.and_then(|m| m.modified().ok());
            b_time.cmp(&a_time)
        });

        entries
            .first()
            .map(|e| e.path())
            .context("No encontré ningún buffer .jsonl en el directorio de output. Usá --buffer-path.")?
    };

    if !buffer_path.exists() {
        bail!("El archivo buffer no existe: {}", buffer_path.display());
    }

    let checkpoint_path = checkpoint_path_for_buffer(&buffer_path);
    let flushed_count = read_buffer_checkpoint(&checkpoint_path).await?;
    let pending_products = read_buffer_file_from(&buffer_path, flushed_count).await?;
    let total = flushed_count + pending_products.len();

    print_line(format!("Leyendo buffer: {}", buffer_path.display()));
    print_line(format!("Checkpoint: {}", checkpoint_path.display()));
    print_line(format!("Productos en buffer: {total}"));
    print_line(format!("Ya cargados segun checkpoint: {flushed_count}"));
    print_line(format!("Pendientes de cargar: {}", pending_products.len()));

    if total == 0 {
        print_line("Buffer vacio. Nada para hacer.");
        if args.cleanup {
            cleanup_buffer_file(&buffer_path).await?;
            print_line(format!("Buffer eliminado: {}", buffer_path.display()));
        }
        return Ok(());
    }

    if pending_products.is_empty() {
        print_line("No quedan productos pendientes para cargar.");
        if args.cleanup {
            cleanup_buffer_file(&buffer_path).await?;
            print_line(format!("Buffer eliminado: {}", buffer_path.display()));
        }
        return Ok(());
    }

    let batch_size = args.batch_size;
    let mut processed_this_run = 0usize;
    let mut current_checkpoint = flushed_count;
    let mut counters = BTreeMap::<String, usize>::new();
    let mut halted = false;

    for (batch_index, batch) in pending_products.chunks(batch_size).enumerate() {
        print_line(format!(
            "Procesando batch {}/{} ({} productos)...",
            batch_index + 1,
            (pending_products.len() + batch_size - 1) / batch_size,
            batch.len()
        ));

        for product in batch {
            match try_stage_buffered_product(config, pool, remote, product).await {
                Ok(sync_status) => {
                    current_checkpoint += 1;
                    write_buffer_checkpoint(&checkpoint_path, current_checkpoint).await?;
                    *counters
                        .entry(sync_status.as_db_value().to_string())
                        .or_insert(0) += 1;
                    emit_staged_product_event(product, sync_status.as_db_value());
                    processed_this_run += 1;
                }
                Err(error) => {
                    print_error(format!(
                        "  ! {} quedo pendiente a partir de este punto: {}",
                        product.name, error
                    ));
                    halted = true;
                    break;
                }
            }
        }

        print_line(format!(
            "Progreso flush: {}/{} ({:.1}%)",
            current_checkpoint,
            total,
            (current_checkpoint as f64 / total as f64) * 100.0
        ));

        if halted {
            break;
        }
    }

    print_line(format!(
        "Flush completado: {processed_this_run} cargados en esta pasada, checkpoint {}/{}",
        current_checkpoint, total
    ));
    for (status, total) in counters {
        print_line(format!("  - {status}: {total}"));
    }

    if args.cleanup && current_checkpoint == total && !halted {
        cleanup_buffer_file(&buffer_path).await?;
        print_line(format!("Buffer eliminado: {}", buffer_path.display()));
    } else if current_checkpoint < total {
        print_line("El buffer NO fue eliminado porque todavia quedan productos pendientes. Podes reintentar con el mismo archivo.");
    }

    Ok(())
}

fn open_html_report(path: &PathBuf) -> Result<()> {
    Command::new("cmd")
        .args(["/C", "start", "", &path.display().to_string()])
        .spawn()
        .context("No pude abrir el reporte HTML.")?;
    Ok(())
}

fn build_scraper_admin_url(base_url: &str, run_id: &str, business_activity: &str) -> String {
    let normalized_base = base_url.trim_end_matches('/');
    format!(
        "{normalized_base}/admin/productos/scraper?run={run_id}&activity={business_activity}"
    )
}


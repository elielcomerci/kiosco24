use anyhow::{Context, Result};
use chrono::Utc;
use serde_json::Value;
use sqlx::{postgres::{PgPoolOptions, PgRow}, PgPool, Row};
use uuid::Uuid;

use crate::models::{
    CompareOutcome, RemoteMatchedVariant, RemoteProductSnapshot, ReviewAction, RunStatus,
    ScrapeRunRow, ScrapedProductInput, ScrapedProductRow, ScraperSource, StageProductRecord,
    SyncStatus,
};
use crate::remote::PublishedRemoteProduct;

pub async fn connect(database_url: &str) -> Result<PgPool> {
    PgPoolOptions::new()
        .max_connections(5)
        .connect(database_url)
        .await
        .context("No pude conectar con Neon/Postgres.")
}

pub async fn create_run(
    pool: &PgPool,
    source: ScraperSource,
    category_url: &str,
    root_url: Option<&str>,
) -> Result<String> {
    let run_id = Uuid::new_v4().to_string();
    let now = Utc::now();
    let row = sqlx::query(
        r#"
        INSERT INTO "ScrapeRun" ("id", "source", "rootUrl", "categoryUrl", "status", "startedAt", "createdAt", "updatedAt")
        VALUES ($1, $2::"ScraperSource", $3, $4, $5::"ScrapeRunStatus", $6, $7, $8)
        RETURNING id
        "#,
    )
    .bind(&run_id)
    .bind(source.as_db_value())
    .bind(root_url)
    .bind(category_url)
    .bind(RunStatus::Running.as_db_value())
    .bind(now)
    .bind(now)
    .bind(now)
    .fetch_one(pool)
    .await?;

    Ok(row.try_get::<String, _>("id")?)
}

pub async fn finish_run(
    pool: &PgPool,
    run_id: &str,
    status: RunStatus,
    error_message: Option<&str>,
) -> Result<()> {
    sqlx::query(
        r#"
        UPDATE "ScrapeRun"
        SET "status" = $2::"ScrapeRunStatus",
            "errorMessage" = $3,
            "finishedAt" = $4,
            "updatedAt" = $4
        WHERE id = $1
        "#,
    )
    .bind(run_id)
    .bind(status.as_db_value())
    .bind(error_message)
    .bind(Utc::now())
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn insert_scraped_product(pool: &PgPool, record: &StageProductRecord) -> Result<String> {
    let product_id = Uuid::new_v4().to_string();
    let now = Utc::now();
    let row = sqlx::query(
        r#"
        INSERT INTO "ScrapedProduct" (
          "id",
          "runId",
          "source",
          "barcode",
          "name",
          "brand",
          "categoryName",
          "description",
          "presentation",
          "priceRaw",
          "image",
          "imageSourceUrl",
          "sourceUrl",
          "contentHash",
          "syncStatus",
          "reviewAction",
          "remotePlatformProductId",
          "remoteOwnerType",
          "remoteSnapshot",
          "conflictFields",
          "createdAt",
          "updatedAt"
        )
        VALUES (
          $1,
          $2,
          $3::"ScraperSource",
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15::"ScrapedProductSyncStatus",
          $16::"ScrapedProductReviewAction",
          $17,
          $18,
          $19,
          $20,
          $21,
          $22
        )
        RETURNING id
        "#,
    )
    .bind(&product_id)
    .bind(&record.run_id)
    .bind(record.source.as_db_value())
    .bind(&record.barcode)
    .bind(&record.name)
    .bind(&record.brand)
    .bind(&record.category_name)
    .bind(&record.description)
    .bind(&record.presentation)
    .bind(&record.price_raw)
    .bind(&record.image)
    .bind(&record.image_source_url)
    .bind(&record.source_url)
    .bind(&record.content_hash)
    .bind(record.compare_outcome.sync_status.as_db_value())
    .bind(ReviewAction::Pending.as_db_value())
    .bind(&record.compare_outcome.remote_platform_product_id)
    .bind(&record.compare_outcome.remote_owner_type)
    .bind(record.compare_outcome.remote_snapshot.clone())
    .bind(record.compare_outcome.conflict_fields.clone())
    .bind(now)
    .bind(now)
    .fetch_one(pool)
    .await?;

    Ok(row.try_get::<String, _>("id")?)
}

pub async fn list_run_products(
    pool: &PgPool,
    run_id: &str,
    only_conflicts: bool,
) -> Result<Vec<ScrapedProductRow>> {
    let select_clause = r#"
        SELECT
          id,
          "runId",
          barcode,
          name,
          brand,
          "categoryName",
          description,
          presentation,
          "priceRaw",
          image,
          "imageSourceUrl",
          "sourceUrl",
          "syncStatus"::text AS "syncStatusText",
          "reviewAction"::text AS "reviewActionText",
          "reviewNote",
          "remotePlatformProductId",
          "remoteOwnerType",
          "remoteSnapshot",
          "conflictFields",
          "publishedAt",
          "createdAt",
          "updatedAt"
        FROM "ScrapedProduct"
    "#;

    let rows = if only_conflicts {
        sqlx::query(&format!(
            r#"
            {select_clause}
            WHERE "runId" = $1 AND "syncStatus" = 'CONFLICT'
            ORDER BY "createdAt" ASC
            "#
        ))
        .bind(run_id)
        .fetch_all(pool)
        .await?
        .into_iter()
        .map(map_scraped_product_row)
        .collect::<Result<Vec<_>>>()?
    } else {
        sqlx::query(&format!(
            r#"
            {select_clause}
            WHERE "runId" = $1
            ORDER BY "createdAt" ASC
            "#
        ))
        .bind(run_id)
        .fetch_all(pool)
        .await?
        .into_iter()
        .map(map_scraped_product_row)
        .collect::<Result<Vec<_>>>()?
    };

    Ok(rows)
}

pub async fn get_product(pool: &PgPool, product_id: &str) -> Result<ScrapedProductRow> {
    let row = sqlx::query(
        r#"
        SELECT
          id,
          "runId",
          barcode,
          name,
          brand,
          "categoryName",
          description,
          presentation,
          "priceRaw",
          image,
          "imageSourceUrl",
          "sourceUrl",
          "syncStatus"::text AS "syncStatusText",
          "reviewAction"::text AS "reviewActionText",
          "reviewNote",
          "remotePlatformProductId",
          "remoteOwnerType",
          "remoteSnapshot",
          "conflictFields",
          "publishedAt",
          "createdAt",
          "updatedAt"
        FROM "ScrapedProduct"
        WHERE id = $1
        "#,
    )
    .bind(product_id)
    .fetch_one(pool)
    .await
    .with_context(|| format!("No encontré el producto scrapeado {product_id}."))?;

    map_scraped_product_row(row)
}

pub async fn update_compare_outcome(
    pool: &PgPool,
    product_id: &str,
    outcome: &CompareOutcome,
) -> Result<()> {
    sqlx::query(
        r#"
        UPDATE "ScrapedProduct"
        SET "syncStatus" = $2::"ScrapedProductSyncStatus",
            "remotePlatformProductId" = $3,
            "remoteOwnerType" = $4,
            "remoteSnapshot" = $5,
            "conflictFields" = $6,
            "updatedAt" = $7
        WHERE id = $1
        "#,
    )
    .bind(product_id)
    .bind(outcome.sync_status.as_db_value())
    .bind(&outcome.remote_platform_product_id)
    .bind(&outcome.remote_owner_type)
    .bind(outcome.remote_snapshot.clone())
    .bind(outcome.conflict_fields.clone())
    .bind(Utc::now())
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn mark_keep_remote(pool: &PgPool, product_id: &str, review_note: Option<&str>) -> Result<()> {
    sqlx::query(
        r#"
        UPDATE "ScrapedProduct"
        SET "syncStatus" = $2::"ScrapedProductSyncStatus",
            "reviewAction" = $3::"ScrapedProductReviewAction",
            "reviewNote" = $4,
            "updatedAt" = $5
        WHERE id = $1
        "#,
    )
    .bind(product_id)
    .bind(SyncStatus::Skipped.as_db_value())
    .bind(ReviewAction::KeepRemote.as_db_value())
    .bind(review_note)
    .bind(Utc::now())
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn mark_published(
    pool: &PgPool,
    product_id: &str,
    remote_platform_product_id: Option<&str>,
) -> Result<()> {
    let now = Utc::now();
    sqlx::query(
        r#"
        UPDATE "ScrapedProduct"
        SET "syncStatus" = $2::"ScrapedProductSyncStatus",
            "reviewAction" = $3::"ScrapedProductReviewAction",
            "publishedAt" = $4,
            "remotePlatformProductId" = COALESCE($5, "remotePlatformProductId"),
            "updatedAt" = $4
        WHERE id = $1
        "#,
    )
    .bind(product_id)
    .bind(SyncStatus::Published.as_db_value())
    .bind(ReviewAction::UseScraped.as_db_value())
    .bind(now)
    .bind(remote_platform_product_id)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn mark_error(pool: &PgPool, product_id: &str, review_note: &str) -> Result<()> {
    sqlx::query(
        r#"
        UPDATE "ScrapedProduct"
        SET "syncStatus" = $2::"ScrapedProductSyncStatus",
            "reviewNote" = $3,
            "updatedAt" = $4
        WHERE id = $1
        "#,
    )
    .bind(product_id)
    .bind(SyncStatus::Error.as_db_value())
    .bind(review_note)
    .bind(Utc::now())
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn get_run(pool: &PgPool, run_id: &str) -> Result<ScrapeRunRow> {
    sqlx::query_as::<_, ScrapeRunRow>(
        r#"
        SELECT
          id,
          "source"::text AS source,
          "rootUrl",
          "categoryUrl",
          "status"::text AS status,
          "errorMessage",
          "startedAt",
          "finishedAt"
        FROM "ScrapeRun"
        WHERE id = $1
        "#,
    )
        .bind(run_id)
        .fetch_one(pool)
        .await
        .with_context(|| format!("No encontré el run {run_id}."))
}

pub async fn summarize_run(pool: &PgPool, run_id: &str) -> Result<Vec<(String, i64)>> {
    let rows = sqlx::query(
        r#"
        SELECT "syncStatus"::text AS "syncStatusText", COUNT(*) AS total
        FROM "ScrapedProduct"
        WHERE "runId" = $1
        GROUP BY "syncStatus"
        ORDER BY "syncStatus" ASC
        "#,
    )
    .bind(run_id)
    .fetch_all(pool)
    .await?;

    let mut result = Vec::new();
    for row in rows {
        result.push((
            row.try_get::<String, _>("syncStatusText")?,
            row.try_get::<i64, _>("total")?,
        ));
    }

    Ok(result)
}

pub fn conflict_fields(value: &Option<Value>) -> Vec<String> {
    value
        .as_ref()
        .and_then(|raw| raw.as_array().cloned())
        .unwrap_or_default()
        .into_iter()
        .filter_map(|entry| entry.as_str().map(str::to_string))
        .collect()
}

fn map_scraped_product_row(row: PgRow) -> Result<ScrapedProductRow> {
    Ok(ScrapedProductRow {
        id: row.try_get("id")?,
        run_id: row.try_get("runId")?,
        barcode: row.try_get("barcode")?,
        name: row.try_get("name")?,
        brand: row.try_get("brand")?,
        category_name: row.try_get("categoryName")?,
        description: row.try_get("description")?,
        presentation: row.try_get("presentation")?,
        price_raw: row.try_get("priceRaw")?,
        image: row.try_get("image")?,
        image_source_url: row.try_get("imageSourceUrl")?,
        source_url: row.try_get("sourceUrl")?,
        sync_status: row.try_get("syncStatusText")?,
        review_action: row.try_get("reviewActionText")?,
        review_note: row.try_get("reviewNote")?,
        remote_platform_product_id: row.try_get("remotePlatformProductId")?,
        remote_owner_type: row.try_get("remoteOwnerType")?,
        remote_snapshot: row.try_get("remoteSnapshot")?,
        conflict_fields: row.try_get("conflictFields")?,
        published_at: row.try_get("publishedAt")?,
        created_at: row.try_get("createdAt")?,
        updated_at: row.try_get("updatedAt")?,
    })
}

pub async fn find_platform_match_by_barcode(
    pool: &PgPool,
    barcode: &str,
) -> Result<Option<(String, RemoteProductSnapshot)>> {
    let direct = sqlx::query(
        r#"
        SELECT
          id,
          barcode,
          name,
          brand,
          "categoryName",
          presentation,
          description,
          image,
          status::text AS status,
          "updatedAt"
        FROM "PlatformProduct"
        WHERE barcode = $1
        "#,
    )
    .bind(barcode)
    .fetch_optional(pool)
    .await?;

    if let Some(row) = direct {
        return Ok(Some((
            "product".to_string(),
            RemoteProductSnapshot {
                id: row.try_get("id")?,
                barcode: row.try_get("barcode")?,
                name: row.try_get("name")?,
                brand: row.try_get("brand")?,
                category_name: row.try_get("categoryName")?,
                presentation: row.try_get("presentation")?,
                description: row.try_get("description")?,
                image: row.try_get("image")?,
                status: row.try_get("status")?,
                updated_at: row
                    .try_get::<chrono::NaiveDateTime, _>("updatedAt")
                    .ok()
                    .map(|value| value.to_string()),
                matched_variant: None,
            },
        )));
    }

    let variant = sqlx::query(
        r#"
        SELECT
          p.id,
          p.barcode,
          p.name,
          p.brand,
          p."categoryName",
          p.presentation,
          p.description,
          p.image,
          p.status::text AS status,
          p."updatedAt",
          v.id AS "variantId",
          v.name AS "variantName",
          v.barcode AS "variantBarcode"
        FROM "PlatformProductVariant" v
        INNER JOIN "PlatformProduct" p ON p.id = v."platformProductId"
        WHERE v.barcode = $1
        LIMIT 1
        "#,
    )
    .bind(barcode)
    .fetch_optional(pool)
    .await?;

    if let Some(row) = variant {
        return Ok(Some((
            "variant".to_string(),
            RemoteProductSnapshot {
                id: row.try_get("id")?,
                barcode: row.try_get("barcode")?,
                name: row.try_get("name")?,
                brand: row.try_get("brand")?,
                category_name: row.try_get("categoryName")?,
                presentation: row.try_get("presentation")?,
                description: row.try_get("description")?,
                image: row.try_get("image")?,
                status: row.try_get("status")?,
                updated_at: row
                    .try_get::<chrono::NaiveDateTime, _>("updatedAt")
                    .ok()
                    .map(|value| value.to_string()),
                matched_variant: Some(RemoteMatchedVariant {
                    id: row.try_get("variantId")?,
                    name: row.try_get("variantName")?,
                    barcode: row.try_get("variantBarcode")?,
                }),
            },
        )));
    }

    Ok(None)
}

pub async fn upsert_platform_product_direct(
    pool: &PgPool,
    product: &ScrapedProductInput,
) -> Result<PublishedRemoteProduct> {
    let barcode = product
        .barcode
        .clone()
        .context("No se puede publicar un producto sin barcode.")?;

    if let Some((owner_type, remote)) = find_platform_match_by_barcode(pool, &barcode).await? {
        if owner_type == "variant" {
            anyhow::bail!(
                "Ese barcode ya existe como variante en la base colaborativa ({})",
                remote.name
            );
        }
    }

    let now = Utc::now().naive_utc();
    let existing = sqlx::query(r#"SELECT id FROM "PlatformProduct" WHERE barcode = $1"#)
        .bind(&barcode)
        .fetch_optional(pool)
        .await?;

    let product_id = if let Some(row) = existing {
        let id: String = row.try_get("id")?;
        sqlx::query(
            r#"
            UPDATE "PlatformProduct"
            SET
              name = $2,
              brand = $3,
              "categoryName" = $4,
              presentation = $5,
              description = $6,
              image = $7,
              status = 'APPROVED',
              "updatedAt" = $8
            WHERE id = $1
            "#,
        )
        .bind(&id)
        .bind(&product.name)
        .bind(&product.brand)
        .bind(&product.category_name)
        .bind(&product.presentation)
        .bind(&product.description)
        .bind(&product.image)
        .bind(now)
        .execute(pool)
        .await?;
        id
    } else {
        let id = Uuid::new_v4().to_string();
        sqlx::query(
            r#"
            INSERT INTO "PlatformProduct" (
              id,
              barcode,
              name,
              brand,
              "categoryName",
              presentation,
              description,
              image,
              status,
              "createdAt",
              "updatedAt"
            )
            VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              $6,
              $7,
              $8,
              'APPROVED',
              $9,
              $10
            )
            "#,
        )
        .bind(&id)
        .bind(&product.barcode)
        .bind(&product.name)
        .bind(&product.brand)
        .bind(&product.category_name)
        .bind(&product.presentation)
        .bind(&product.description)
        .bind(&product.image)
        .bind(now)
        .bind(now)
        .execute(pool)
        .await?;
        id
    };

    Ok(PublishedRemoteProduct {
        id: product_id,
        barcode: product.barcode.clone(),
        name: product.name.clone(),
        brand: product.brand.clone(),
        category_name: product.category_name.clone(),
        presentation: product.presentation.clone(),
        description: product.description.clone(),
        image: product.image.clone(),
        status: Some("APPROVED".to_string()),
    })
}

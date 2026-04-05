use std::{
    fs,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result};
use serde_json::Value;

use crate::{
    db::conflict_fields,
    models::{ScrapeRunRow, ScrapedProductRow},
};

pub fn generate_review_html(
    run: &ScrapeRunRow,
    products: &[ScrapedProductRow],
    output_dir: &Path,
    admin_review_url: Option<&str>,
) -> Result<PathBuf> {
    fs::create_dir_all(output_dir).with_context(|| {
        format!(
            "No pude crear el directorio de reportes {}.",
            output_dir.display()
        )
    })?;

    let path = output_dir.join(format!("review-{}.html", run.id));
    let mut html = String::new();
    html.push_str(
        r#"<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Review de scraping</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #09151f; color: #eef6ff; margin: 0; padding: 24px; }
    h1, h2, h3 { margin: 0 0 12px; }
    .run { background: #0f2130; border: 1px solid #1c3a54; border-radius: 18px; padding: 20px; margin-bottom: 24px; }
    .grid { display: grid; gap: 18px; }
    .card { background: #112536; border: 1px solid #1c3a54; border-radius: 18px; padding: 18px; }
    .columns { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
    .pill { display: inline-block; padding: 4px 10px; border-radius: 999px; background: #18354d; margin-right: 8px; margin-bottom: 8px; font-size: 12px; }
    .images { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-top: 12px; }
    .images img { width: 100%; max-height: 240px; object-fit: contain; border-radius: 14px; background: #ffffff; }
    dl { display: grid; grid-template-columns: 140px 1fr; gap: 8px 12px; margin: 0; }
    dt { color: #91b8da; }
    dd { margin: 0; word-break: break-word; }
    a { color: #7dd3fc; }
  </style>
</head>
<body>
"#,
    );

    html.push_str(&format!(
        r#"<section class="run">
  <h1>Review del run {}</h1>
  <p>Fuente: {} | URL categoría: {} | Estado: {}</p>
  <p>Productos listados: {}</p>
  <p>Este review muestra productos en staging interno. Todavia no fueron publicados en la base colaborativa.</p>
  <p>La edicion real antes de publicar se hace en el panel admin del scraper.</p>
  {}
</section>
"#,
        escape_html(&run.id),
        escape_html(&run.source),
        escape_html(&run.category_url),
        escape_html(&run.status),
        products.len(),
        render_admin_cta(admin_review_url)
    ));

    html.push_str(r#"<section class="grid">"#);
    for product in products {
        let conflicts = conflict_fields(&product.conflict_fields);
        let remote = product.remote_snapshot.as_ref();
        let remote_image = json_string(remote, "image");
        let remote_name = json_string(remote, "name");
        let remote_brand = json_string(remote, "brand");
        let remote_category = json_string(remote, "categoryName");
        let remote_presentation = json_string(remote, "presentation");
        let remote_description = json_string(remote, "description");
        let product_admin_url = admin_review_url
            .map(|base| format!("{base}#scraped-product-{}", product.id));

        html.push_str(&format!(
            r#"<article class="card">
  <h2>{}</h2>
  <p><strong>ID:</strong> {}</p>
  <p><strong>Barcode:</strong> {}</p>
  <div>{}</div>
  {}
  <div class="columns">
    <section>
      <h3>Scrapeado</h3>
      <dl>
        <dt>Nombre</dt><dd>{}</dd>
        <dt>Marca</dt><dd>{}</dd>
        <dt>Categoría</dt><dd>{}</dd>
        <dt>Presentación</dt><dd>{}</dd>
        <dt>Descripción</dt><dd>{}</dd>
        <dt>Imagen</dt><dd><a href="{}" target="_blank">{}</a></dd>
      </dl>
    </section>
    <section>
      <h3>Actual en base</h3>
      <dl>
        <dt>Nombre</dt><dd>{}</dd>
        <dt>Marca</dt><dd>{}</dd>
        <dt>Categoría</dt><dd>{}</dd>
        <dt>Presentación</dt><dd>{}</dd>
        <dt>Descripción</dt><dd>{}</dd>
        <dt>Imagen</dt><dd><a href="{}" target="_blank">{}</a></dd>
      </dl>
    </section>
  </div>
  <div class="images">
    <div>
      <h3>Imagen scrapeada</h3>
      {}
    </div>
    <div>
      <h3>Imagen actual</h3>
      {}
    </div>
  </div>
</article>
"#,
            escape_html(&product.name),
            escape_html(&product.id),
            escape_html(product.barcode.as_deref().unwrap_or("(sin barcode)")),
            conflicts
                .iter()
                .map(|field| format!(r#"<span class="pill">{}</span>"#, escape_html(field)))
                .collect::<Vec<_>>()
                .join(""),
            render_admin_inline_link(product_admin_url.as_deref()),
            escape_html(&product.name),
            escape_html(product.brand.as_deref().unwrap_or("—")),
            escape_html(product.category_name.as_deref().unwrap_or("—")),
            escape_html(product.presentation.as_deref().unwrap_or("—")),
            escape_html(product.description.as_deref().unwrap_or("—")),
            escape_html(product.image.as_deref().unwrap_or("#")),
            escape_html(product.image.as_deref().unwrap_or("sin imagen")),
            escape_html(remote_name.as_deref().unwrap_or("—")),
            escape_html(remote_brand.as_deref().unwrap_or("—")),
            escape_html(remote_category.as_deref().unwrap_or("—")),
            escape_html(remote_presentation.as_deref().unwrap_or("—")),
            escape_html(remote_description.as_deref().unwrap_or("—")),
            escape_html(remote_image.as_deref().unwrap_or("#")),
            escape_html(remote_image.as_deref().unwrap_or("sin imagen")),
            render_image(product.image.as_deref()),
            render_image(remote_image.as_deref()),
        ));
    }
    html.push_str("</section></body></html>");

    fs::write(&path, html)
        .with_context(|| format!("No pude escribir el reporte HTML {}", path.display()))?;

    Ok(path)
}

fn json_string(value: Option<&Value>, key: &str) -> Option<String> {
    value
        .and_then(|raw| raw.get(key))
        .and_then(|raw| raw.as_str())
        .map(str::to_string)
}

fn render_image(url: Option<&str>) -> String {
    match url {
        Some(value) if !value.trim().is_empty() && value != "#" => {
            format!(r#"<img src="{}" alt="preview" />"#, escape_html(value))
        }
        _ => "<p>Sin imagen.</p>".to_string(),
    }
}

fn render_admin_cta(url: Option<&str>) -> String {
    match url {
        Some(value) => format!(
            r#"<p><a href="{}" target="_blank" rel="noreferrer" style="display:inline-block;padding:12px 16px;border-radius:12px;background:#38bdf8;color:#082f49;font-weight:800;text-decoration:none;">Abrir editor real en admin</a></p>"#,
            escape_html(value)
        ),
        None => "<p>No se pudo construir el link al panel admin para este run.</p>".to_string(),
    }
}

fn render_admin_inline_link(url: Option<&str>) -> String {
    match url {
        Some(value) => format!(
            r#"<p><a href="{}" target="_blank" rel="noreferrer">Editar este producto en admin</a></p>"#,
            escape_html(value)
        ),
        None => String::new(),
    }
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

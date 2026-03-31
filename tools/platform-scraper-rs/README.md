# platform-scraper-rs

Scraper local en Rust para nutrir la base colaborativa de `kiosco24`.

Que hace:
- scrapea catalogos desde URLs de categoria
- sigue paginacion tipo `?page=2`
- puede recorrer Carrefour desde la home usando una lista curada de categorias principales
- descarga y localiza imagenes en `media.zap.com.ar` via Cloudflare R2
- guarda runs y productos scrapeados en Neon usando las tablas Prisma del repo
- compara por barcode contra la base colaborativa
- publica por defecto directo a Neon, sin depender del endpoint remoto
- genera un review HTML con diff de textos, imagenes y `ScrapedProduct.id`

## Requisitos

- Rust instalado
- `.env.local` en la raiz del repo con:
  - `DATABASE_URL`
  - `PLATFORM_INGEST_TOKEN` o `KIOSCO24_PLATFORM_INGEST_TOKEN`
  - `R2_ENDPOINT`
  - `R2_BUCKET_NAME`
  - `R2_ACCESS_KEY_ID`
  - `R2_SECRET_ACCESS_KEY`
  - `R2_PUBLIC_BASE_URL`
- opcional:
  - `KIOSCO24_BASE_URL`
  - `SCRAPER_ROOT_URL`
  - `SCRAPE_DELAY_MIN_SECONDS`
  - `SCRAPE_DELAY_MAX_SECONDS`
  - `SCRAPER_USE_REMOTE_API=true`

El binario carga automaticamente las variables desde la raiz de `kiosco24`, asi que no hace falta duplicarlas dentro de este subproyecto.

## Modo de publicacion

Por defecto:
- `compare` usa Neon directo
- `publish` hace upsert directo en `PlatformProduct`

Esto evita depender del endpoint remoto cuando hay problemas de token o autenticacion.

Si queres forzar el endpoint HTTP de `kiosco24`, activa:

```powershell
$env:SCRAPER_USE_REMOTE_API="true"
```

## Comandos

Compilar:

```powershell
C:\Users\eliel\.cargo\bin\cargo.exe build
```

Escanear una categoria puntual de Carrefour:

```powershell
C:\Users\eliel\.cargo\bin\cargo.exe run -- scan --source carrefour --url "https://www.carrefour.com.ar/almacen" --root-url "https://www.carrefour.com.ar/"
```

Escanear arrancando desde una pagina especifica:

```powershell
C:\Users\eliel\.cargo\bin\cargo.exe run -- scan --source carrefour --url "https://www.carrefour.com.ar/almacen?page=2" --root-url "https://www.carrefour.com.ar/" --limit 10
```

Reanudar manualmente desde una categoria y pagina puntuales si el checkpoint se rompio:

```powershell
C:\Users\eliel\.cargo\bin\cargo.exe run -- scan --source carrefour --url "https://www.carrefour.com.ar/" --root-url "https://www.carrefour.com.ar/" --discover-categories --resume-run-id "<run-id>" --resume-category-url "https://www.carrefour.com.ar/bebidas" --resume-page-number 16
```

Recorrer Carrefour desde la home usando la lista curada de categorias principales:

```powershell
C:\Users\eliel\.cargo\bin\cargo.exe run -- scan --source carrefour --url "https://www.carrefour.com.ar/" --root-url "https://www.carrefour.com.ar/" --discover-categories --max-categories 5
```

Prueba corta:

```powershell
C:\Users\eliel\.cargo\bin\cargo.exe run -- scan --source carrefour --url "https://www.carrefour.com.ar/almacen" --root-url "https://www.carrefour.com.ar/" --limit 2
```

Recomparar un producto o un run:

```powershell
C:\Users\eliel\.cargo\bin\cargo.exe run -- compare --product-id "<scraped-product-id>"
C:\Users\eliel\.cargo\bin\cargo.exe run -- compare --run-id "<run-id>"
```

Generar review HTML:

```powershell
C:\Users\eliel\.cargo\bin\cargo.exe run -- review --run-id "<run-id>" --open-html
```

Review interactiva en terminal:

```powershell
C:\Users\eliel\.cargo\bin\cargo.exe run -- review --run-id "<run-id>" --interactive
```

Publicar un producto:

```powershell
C:\Users\eliel\.cargo\bin\cargo.exe run -- publish --product-id "<scraped-product-id>"
```

## Uso periodico simple

Si queres correrlo cada tanto sin recordar argumentos:

1. Compila una vez el binario release:

```powershell
C:\Users\eliel\.cargo\bin\cargo.exe build --release
```

2. Despues podes ejecutar:

- [Escanear Carrefour.cmd](/c:/Users/eliel/kiosco24/tools/platform-scraper-rs/Escanear%20Carrefour.cmd)

Ese launcher:
- recorre Carrefour desde la home usando las categorias curadas
- guarda el `run id` mas reciente en `output/latest-run.txt`
- genera el review HTML
- abre un dashboard en vivo en `output/live-dashboard.html`
- y al final deja el link al review generado

Si preferis correrlo por PowerShell y limitar una pasada de prueba:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\eliel\kiosco24\tools\platform-scraper-rs\scripts\run-carrefour-review.ps1" -Limit 5
```

Si queres reanudar manualmente desde el launcher:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\eliel\kiosco24\tools\platform-scraper-rs\scripts\run-carrefour-review.ps1" -ResumeCategoryUrl "https://www.carrefour.com.ar/bebidas" -ResumePageNumber 16
```

## Validacion end-to-end ya comprobada

Flujo validado contra Carrefour:
- extraccion de productos desde categoria y paginacion
- lectura de EAN desde detalle del producto
- normalizacion de nombre, marca, categoria y presentacion
- subida de imagenes a `media.zap.com.ar`
- guardado en Neon (`ScrapeRun` + `ScrapedProduct`)
- publish directo a `PlatformProduct`
- compare posterior devolviendo `MATCHED`

## Tablas Prisma

Este subproyecto usa las tablas agregadas al schema principal:
- `ScrapeRun`
- `ScrapedProduct`

Si el schema cambia, sincronizalo desde la raiz del repo:

```powershell
cmd /c npx prisma generate
cmd /c npx prisma db push
```

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { put } from "@vercel/blob";
import QRCode from "qrcode";

import { AFIP_DOCUMENT_TYPES, formatDateForHuman, getEmitterIvaLabel, getSaleConditionLabel, type FiscalEmitterSnapshot } from "@/lib/fiscal";

type InvoicePdfInput = {
  emitter: FiscalEmitterSnapshot;
  voucherNumber: number;
  pointOfSale: number;
  issueDate: Date;
  cae: string;
  caeDueDate: Date;
  receiverName: string;
  receiverDocumentType: number;
  receiverDocumentNumber: string;
  receiverIvaConditionLabel: string;
  paymentMethod: string;
  total: number;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
};

const RECEIPT_WIDTH = 226.77;
const RECEIPT_PAGE_HEIGHT = 841.89;

function sanitizeSegment(value: string, fallback: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return normalized || fallback;
}

function formatArsPlain(value: number) {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatVoucherNumber(pointOfSale: number, voucherNumber: number) {
  return `${String(pointOfSale).padStart(5, "0")}-${String(voucherNumber).padStart(8, "0")}`;
}

function formatIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getDocumentLabel(documentType: number) {
  if (documentType === AFIP_DOCUMENT_TYPES.CUIT) return "CUIT";
  if (documentType === AFIP_DOCUMENT_TYPES.DNI) return "DNI";
  return "Consumidor final";
}

function getReceiverLegend(receiverIvaConditionLabel: string) {
  return `A ${receiverIvaConditionLabel.toUpperCase()}`;
}

function getGrossIncomeLabel(value: string | null) {
  return value?.trim() ? value.trim() : "No contribuyente";
}

function buildFiscalQrUrl(input: InvoicePdfInput) {
  const payload: Record<string, number | string> = {
    ver: 1,
    fecha: formatIsoDate(input.issueDate),
    cuit: Number(input.emitter.cuit),
    ptoVta: input.pointOfSale,
    tipoCmp: 11,
    nroCmp: input.voucherNumber,
    importe: Number(input.total.toFixed(2)),
    moneda: "PES",
    ctz: 1,
    tipoCodAut: "E",
    codAut: Number(input.cae),
  };

  if (
    input.receiverDocumentType !== AFIP_DOCUMENT_TYPES.CONSUMIDOR_FINAL &&
    input.receiverDocumentNumber &&
    Number(input.receiverDocumentNumber) > 0
  ) {
    payload.tipoDocRec = input.receiverDocumentType;
    payload.nroDocRec = Number(input.receiverDocumentNumber);
  }

  return `https://www.arca.gob.ar/fe/qr/?p=${Buffer.from(JSON.stringify(payload), "utf8").toString("base64")}`;
}

async function uploadPdfToBlob(pdfBytes: Buffer, fileName: string) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return null;
  }

  const safeFileName = sanitizeSegment(fileName.replace(/\.pdf$/i, ""), "factura");

  const blob = await put(`fiscal/${safeFileName}.pdf`, pdfBytes, {
    access: "public",
    addRandomSuffix: true,
    contentType: "application/pdf",
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  return blob.url;
}

function getR2Config() {
  const endpoint = process.env.R2_ENDPOINT?.trim();
  const bucket = process.env.R2_BUCKET_NAME?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.trim() || null;

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return {
    endpoint,
    bucket,
    accessKeyId,
    secretAccessKey,
    publicBaseUrl,
  };
}

function getR2Client(config: NonNullable<ReturnType<typeof getR2Config>>) {
  return new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

function buildR2PublicUrl(baseUrl: string | null, key: string) {
  if (!baseUrl) return null;
  return `${baseUrl.replace(/\/+$/, "")}/${key.replace(/^\/+/, "")}`;
}

async function uploadPdfToR2(pdfBytes: Buffer, fileName: string) {
  const config = getR2Config();
  if (!config) {
    return null;
  }

  const safeFileName = sanitizeSegment(fileName.replace(/\.pdf$/i, ""), "factura");
  const key = `fiscal/${safeFileName}.pdf`;
  const client = getR2Client(config);

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: pdfBytes,
      ContentType: "application/pdf",
      ContentDisposition: `inline; filename="${safeFileName}.pdf"`,
    }),
  );

  return buildR2PublicUrl(config.publicBaseUrl, key);
}

async function uploadInvoicePdf(pdfBytes: Buffer, fileName: string) {
  const r2Url = await uploadPdfToR2(pdfBytes, fileName);
  if (r2Url) {
    return r2Url;
  }

  return uploadPdfToBlob(pdfBytes, fileName);
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 18,
    paddingBottom: 18,
    paddingHorizontal: 16,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#111827",
    backgroundColor: "#ffffff",
  },
  centered: {
    textAlign: "center",
  },
  strong: {
    fontWeight: 700,
  },
  title: {
    fontSize: 15,
    fontWeight: 700,
    textAlign: "center",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 10,
    textAlign: "center",
    marginBottom: 2,
  },
  tinySubtitle: {
    fontSize: 8,
    textAlign: "center",
    marginBottom: 2,
  },
  muted: {
    color: "#4b5563",
  },
  rule: {
    borderTopWidth: 1,
    borderTopColor: "#111827",
    marginVertical: 10,
  },
  dashedRule: {
    borderTopWidth: 1,
    borderTopStyle: "dashed",
    borderTopColor: "#6b7280",
    marginVertical: 10,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  rowWrap: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    flexWrap: "wrap",
  },
  section: {
    gap: 4,
  },
  itemMeta: {
    fontSize: 9,
    color: "#374151",
    marginBottom: 2,
  },
  itemName: {
    fontSize: 10,
    fontWeight: 700,
    marginBottom: 8,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 15,
    fontWeight: 700,
    marginTop: 4,
  },
  qrWrap: {
    marginTop: 10,
    alignItems: "center",
    gap: 8,
  },
  qrImage: {
    width: 110,
    height: 110,
  },
  footerText: {
    textAlign: "center",
    fontSize: 9,
    color: "#4b5563",
    marginTop: 8,
  },
  legalText: {
    fontSize: 8,
    color: "#4b5563",
    textAlign: "center",
    lineHeight: 1.3,
  },
});

function InvoicePdfDocument({
  input,
  qrDataUrl,
}: {
  input: InvoicePdfInput;
  qrDataUrl: string;
}) {
  const voucherNumber = formatVoucherNumber(input.pointOfSale, input.voucherNumber);
  const issueDate = formatDateForHuman(input.issueDate);
  const caeDueDate = formatDateForHuman(input.caeDueDate);

  return (
    <Document
      title={`Factura C ${voucherNumber}`}
      author="Kiosco24"
      subject="Factura C"
      creator="Kiosco24"
      producer="Kiosco24"
    >
      <Page size={{ width: RECEIPT_WIDTH, height: RECEIPT_PAGE_HEIGHT }} style={styles.page} wrap>
        <View style={styles.centered}>
          <Text style={styles.title}>FACTURA C</Text>
          <Text style={[styles.tinySubtitle, styles.strong]}>ORIGINAL</Text>
          <Text style={styles.subtitle}>{input.emitter.razonSocial}</Text>
          <Text style={[styles.subtitle, styles.muted]}>CUIT: {input.emitter.cuit}</Text>
          <Text style={[styles.subtitle, styles.muted]}>Ing. Brutos: {getGrossIncomeLabel(input.emitter.ingresosBrutos)}</Text>
          <Text style={[styles.subtitle, styles.muted]}>{getEmitterIvaLabel(input.emitter.condicionIva)}</Text>
          <Text style={[styles.subtitle, styles.muted]}>Inicio de actividad: {input.emitter.inicioActividad}</Text>
          <Text style={[styles.subtitle, styles.muted]}>Domicilio fiscal: {input.emitter.domicilioFiscal}</Text>
        </View>

        <View style={styles.rule} />

        <View style={styles.section}>
          <View style={styles.rowWrap}>
            <Text style={styles.strong}>P.V. {String(input.pointOfSale).padStart(4, "0")}</Text>
            <Text style={styles.strong}>Nro. {voucherNumber}</Text>
          </View>
          <View style={styles.rowWrap}>
            <Text>Fecha {issueDate}</Text>
            <Text>Cond. venta {getSaleConditionLabel(input.paymentMethod)}</Text>
          </View>
        </View>

        <View style={styles.rule} />

        <View style={styles.section}>
          <Text style={styles.strong}>Receptor</Text>
          <Text>{getReceiverLegend(input.receiverIvaConditionLabel)}</Text>
          <Text>{input.receiverName}</Text>
          <Text style={styles.muted}>
            {getDocumentLabel(input.receiverDocumentType)}:{" "}
            {input.receiverDocumentType === AFIP_DOCUMENT_TYPES.CONSUMIDOR_FINAL ? "0" : input.receiverDocumentNumber}
          </Text>
          <Text style={styles.muted}>{input.receiverIvaConditionLabel}</Text>
        </View>

        <View style={styles.dashedRule} />

        <View style={[styles.section, { marginBottom: 6 }]}>
          <View style={styles.row}>
            <Text style={styles.strong}>Cant./Precio Unit.</Text>
            <Text style={styles.strong}>Importe</Text>
          </View>
        </View>

        <View style={styles.section}>
          {input.items.map((item, index) => (
            <View key={`${item.name}-${index}`} wrap={false}>
              <View style={styles.row}>
                <Text style={styles.itemMeta}>
                  {new Intl.NumberFormat("es-AR", {
                    minimumFractionDigits: 3,
                    maximumFractionDigits: 3,
                  }).format(item.quantity)}{" "}
                  x {formatArsPlain(item.unitPrice)}
                </Text>
                <Text style={styles.itemMeta}>{formatArsPlain(item.subtotal)}</Text>
              </View>
              <Text style={styles.itemName}>{item.name}</Text>
            </View>
          ))}
        </View>

        <View style={styles.rule} />

        <View style={styles.totalRow}>
          <Text>TOTAL $</Text>
          <Text>{formatArsPlain(input.total)}</Text>
        </View>

        <View style={styles.rule} />

        <View style={styles.qrWrap}>
          <Text style={styles.strong}>Comprobante electronico autorizado</Text>
          <Image src={qrDataUrl} style={styles.qrImage} />
          <Text style={styles.legalText}>Escanea para verificar el comprobante en ARCA</Text>
        </View>

        <View style={styles.rule} />

        <View style={styles.section}>
          <View style={styles.row}>
            <Text style={styles.strong}>CAE</Text>
            <Text style={styles.strong}>{input.cae}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.strong}>Vto. CAE</Text>
            <Text style={styles.strong}>{caeDueDate}</Text>
          </View>
        </View>

        <Text style={styles.footerText}>Muchas gracias por su compra</Text>
      </Page>
    </Document>
  );
}

export async function createInvoicePdf(input: InvoicePdfInput) {
  const fileName = `factura-c-${String(input.pointOfSale).padStart(5, "0")}-${String(input.voucherNumber).padStart(8, "0")}.pdf`;
  const qrUrl = buildFiscalQrUrl(input);
  const qrDataUrl = await QRCode.toDataURL(qrUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 220,
  });

  const pdfBytes = await renderToBuffer(<InvoicePdfDocument input={input} qrDataUrl={qrDataUrl} />);
  const blobUrl = await uploadInvoicePdf(pdfBytes, fileName);

  return {
    afipUrl: null,
    blobUrl,
    fileName,
  };
}

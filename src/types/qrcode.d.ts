declare module "qrcode" {
  type ErrorCorrectionLevel = "L" | "M" | "Q" | "H";

  interface ToDataUrlOptions {
    width?: number;
    margin?: number;
    errorCorrectionLevel?: ErrorCorrectionLevel;
  }

  const QRCode: {
    toDataURL(value: string, options?: ToDataUrlOptions): Promise<string>;
  };

  export default QRCode;
}

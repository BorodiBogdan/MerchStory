declare module 'qrcode' {
  export interface QRData {
    modules: { size: number; data: Uint8Array };
    version: number;
  }
  export function create(
    text: string,
    options: { errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H' }
  ): QRData;
}

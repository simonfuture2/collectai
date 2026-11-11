// Counter kit: letter-size counter sign, table tent and a QR PNG, built in the browser.
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { shopUrl } from "./partnerShops";

type Shop = { name: string; slug: string; logoDataUrl?: string | null };
type RGB = [number, number, number];

function cssHsl(varName: string, fallback: RGB): RGB {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    const [h, s, l] = raw.split(/[\s,]+/).map((x) => parseFloat(x));
    if (![h, s, l].every(Number.isFinite)) return fallback;
    const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
    const f = (n: number) => { const k = (n + h / 30) % 12; return Math.round(255 * (l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
    return [f(0), f(8), f(4)];
  } catch { return fallback; }
}

export async function qrDataUrl(slug: string, size = 1024): Promise<string> {
  return QRCode.toDataURL(shopUrl(slug), { width: size, margin: 2, errorCorrectionLevel: "M" });
}

export async function fileToDataUrl(url: string): Promise<string | null> {
  try {
    const blob = await (await fetch(url)).blob();
    return await new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => res(null); r.readAsDataURL(blob); });
  } catch { return null; }
}

function imgFormat(dataUrl: string) { return dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG"; }

function panel(doc: jsPDF, shop: Shop, qr: string, x: number, y: number, w: number, h: number, primary: RGB) {
  const cx = x + w / 2;
  doc.setFillColor(...primary); doc.rect(x, y, w, h * 0.13, "F");
  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(h * 0.045);
  doc.text("Scan your cards free", cx, y + h * 0.085, { align: "center" });
  let top = y + h * 0.17;
  if (shop.logoDataUrl) {
    try { const s = h * 0.12; doc.addImage(shop.logoDataUrl, imgFormat(shop.logoDataUrl), cx - s / 2, top, s, s); top += s + h * 0.02; } catch { /* bad image */ }
  }
  doc.setTextColor(20, 20, 30); doc.setFontSize(h * 0.05);
  doc.text(doc.splitTextToSize(shop.name, w * 0.85), cx, top + h * 0.04, { align: "center" });
  const q = Math.min(w * 0.55, h * 0.42);
  doc.addImage(qr, "PNG", cx - q / 2, top + h * 0.08, q, q);
  doc.setFont("helvetica", "normal"); doc.setFontSize(h * 0.03);
  doc.text("Scan your cards free – ask us how.", cx, top + h * 0.08 + q + h * 0.05, { align: "center" });
  doc.setFontSize(Math.min(h * 0.022, w * 0.022)); doc.setTextColor(90, 90, 100);
  doc.text(doc.splitTextToSize(`Free card price checks, powered by MyCollectAI · mycollectai.com/s/${shop.slug}`, w * 0.9), cx, y + h - h * 0.05, { align: "center" });
}

export async function counterSignPdf(shop: Shop): Promise<Blob> {
  const primary = cssHsl("--primary", [37, 99, 235]);
  const qr = await qrDataUrl(shop.slug);
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  panel(doc, shop, qr, 0, 0, 612, 792, primary);
  return doc.output("blob");
}

/** Table tent: landscape letter, two panels (one upside down) — fold along the middle. */
export async function tableTentPdf(shop: Shop): Promise<Blob> {
  const primary = cssHsl("--primary", [37, 99, 235]);
  const qr = await qrDataUrl(shop.slug, 800);
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" });
  panel(doc, shop, qr, 36, 405, 540, 360, primary);
  // Both halves face out once folded into a tent along the dashed line.
  panel(doc, shop, qr, 36, 27, 540, 360, primary);
  doc.setLineDashPattern([4, 4], 0); doc.setDrawColor(160); doc.line(20, 396, 592, 396);
  doc.setFontSize(9); doc.setTextColor(120); doc.text("Fold here", 306, 392, { align: "center" });
  return doc.output("blob");
}

export function download(blob: Blob | string, filename: string) {
  const a = document.createElement("a");
  a.href = typeof blob === "string" ? blob : URL.createObjectURL(blob);
  a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  if (typeof blob !== "string") setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

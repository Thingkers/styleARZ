import { api } from "../../api";

export const DEFAULT_PRINTER = {
  label: {
    name: "38x25",
    w: 38,
    h: 25,
    orientation: "portrait",
    media: "gaps",
    topGap: 2.5,
  },
  invoice: {
    // 56 mm POS thermal paper, roll 153.08.761.224 (40 mm outside diameter, not a page size).
    name: "56mm POS roll 153.08.761.224",
    w: 56,
    h: 200,
    orientation: "portrait",
    media: "continuous",
    topGap: 3,
  },
};

export function loadPrinterSettings() {
  return api("/api/admin/printer").then((data) => data.printer || DEFAULT_PRINTER);
}

export function savePrinterSettings(printer) {
  return api("/api/admin/printer", { method: "PUT", body: { printer } }).then((data) => data.printer);
}

/** Page size sent to the printer. Portrait keeps width × height, matching the Xprinter stock. */
export function paperFromJob(job, id = "shop") {
  if (!job) return null;
  const portrait = job.orientation !== "landscape";
  const w = portrait ? Number(job.w) : Number(job.h);
  const h = portrait ? Number(job.h) : Number(job.w);
  return {
    id,
    kind: "thermal",
    w,
    h,
    label: `${job.name} · ${job.w}×${job.h} mm · ${job.orientation} · ${job.media === "continuous" ? "continuous" : "gaps"}`,
    media: job.media,
    orientation: job.orientation,
    topGap: Number(job.topGap) || 0,
    shape: h > w ? "tall" : "wide",
  };
}

/** Invoice width stays the roll width. Stock height is only the Windows paper height. */
export function invoicePaperFromJob(job) {
  if (!job) return null;
  return {
    id: "shop",
    kind: "thermal",
    w: Number(job.w),
    h: Number(job.h),
    label: `${job.name} · ${job.w} mm roll · ${job.media === "continuous" ? "continuous" : "gaps"}`,
    media: job.media,
    orientation: job.orientation,
    topGap: Number(job.topGap) || 0,
  };
}

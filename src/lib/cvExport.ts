import JSZip from "jszip";
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import type { CvOutput } from "@/lib/cvStudio";
import { textList } from "@/lib/cvStudio";

export const ACCENT = "1A4E79";
const FONT = "Arial";

// ---------- Contact / experience meta ----------
export type CvContact = {
  full_name?: string | null;
  location?: string | null;
  phone?: string | null;
  email?: string | null;
  linkedin_url?: string | null;
  citizenship?: string | null;
};

export type ExperienceMeta = {
  start_date?: string | null;
  end_date?: string | null;
  is_current?: boolean | null;
  location?: string | null;
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatMonthYear(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  const d = new Date(raw.length <= 7 ? `${raw}-01` : raw);
  if (Number.isNaN(d.getTime())) return raw;
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatRange(meta: ExperienceMeta | undefined): string {
  if (!meta) return "";
  const start = formatMonthYear(meta.start_date);
  const end = meta.is_current ? "Present" : formatMonthYear(meta.end_date);
  if (!start && !end) return "";
  if (!start) return end;
  return `${start} – ${end || "Present"}`;
}

function todayStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

export function buildFileBasename(
  fileBasename: string | null | undefined,
  companyName: string | null | undefined,
  fullName?: string | null,
): string {
  const existing = (fileBasename ?? "").trim();
  if (existing) return existing.replace(/\.(docx|pdf)$/i, "");
  const person = (fullName ?? "Martin Pawluszek").trim().replace(/\s+/g, "_");
  const company = (companyName ?? "Company").trim().replace(/[^\w]+/g, "_").replace(/^_|_$/g, "");
  return `${person}_CV_${company || "Company"}_${todayStamp()}`;
}

// ---------- Section ordering ----------
export type CvSectionKey =
  | "summary"
  | "competencies"
  | "experience"
  | "built"
  | "education"
  | "programs"
  | "languages";

export function sectionOrder(arrangement: string | null | undefined): CvSectionKey[] {
  if ((arrangement ?? "").trim() === "ai_technical") {
    return [
      "summary",
      "competencies",
      "built",
      "experience",
      "education",
      "programs",
      "languages",
    ];
  }
  return [
    "summary",
    "competencies",
    "experience",
    "built",
    "education",
    "programs",
    "languages",
  ];
}

export function technicalFirst(arrangement: string | null | undefined): boolean {
  return (arrangement ?? "").trim() === "ai_technical";
}

export const SECTION_TITLES: Record<CvSectionKey, string> = {
  summary: "Summary",
  competencies: "Core Competencies",
  experience: "Experience",
  built: "Built",
  education: "Education",
  programs: "Programs & Recognition",
  languages: "Languages",
};

// ---------- Metric emphasis ----------
const METRIC_RE = /(\$\s?[\d][\d.,]*\s?[KMB]?|[\d][\d.,]*\s?%|[\d][\d.,]*\+)/g;

export function splitMetrics(text: string): { text: string; bold: boolean }[] {
  const src = text ?? "";
  const parts: { text: string; bold: boolean }[] = [];
  let last = 0;
  for (const m of src.matchAll(METRIC_RE)) {
    const start = m.index ?? 0;
    if (start > last) parts.push({ text: src.slice(last, start), bold: false });
    parts.push({ text: m[0], bold: true });
    last = start + m[0].length;
  }
  if (last < src.length) parts.push({ text: src.slice(last), bold: false });
  return parts.length ? parts : [{ text: src, bold: false }];
}

// ---------- DOCX ----------
function body(text: string, opts: { size?: number; bold?: boolean; spaceAfter?: number } = {}) {
  return new Paragraph({
    spacing: { after: opts.spaceAfter ?? 60 },
    children: [
      new TextRun({ text, font: FONT, size: opts.size ?? 20, bold: opts.bold ?? false }),
    ],
  });
}

function sectionHeader(title: string) {
  return new Paragraph({
    spacing: { before: 240, after: 120 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT, space: 2 },
    },
    children: [
      new TextRun({
        text: title.toUpperCase(),
        font: FONT,
        size: 22,
        bold: true,
        color: ACCENT,
      }),
    ],
  });
}

function bulletParagraph(text: string) {
  return new Paragraph({
    numbering: { reference: "cv-bullets", level: 0 },
    spacing: { after: 60 },
    children: splitMetrics(text).map(
      (p) => new TextRun({ text: p.text, font: FONT, size: 20, bold: p.bold }),
    ),
  });
}

export function buildCvDocument(args: {
  cv: CvOutput;
  contact: CvContact;
  experienceMeta: Record<string, ExperienceMeta>;
}): Document {
  const { cv, contact, experienceMeta } = args;
  const children: Paragraph[] = [];

  // --- Header block (normal body paragraphs, never a Word header part) ---
  children.push(
    new Paragraph({
      spacing: { after: 60 },
      alignment: AlignmentType.LEFT,
      children: [
        new TextRun({
          text: (contact.full_name ?? "").trim() || "Martin Pawluszek",
          font: FONT,
          size: 32,
          bold: true,
          color: ACCENT,
        }),
      ],
    }),
  );
  const contactLine = [contact.location, contact.phone, contact.email, contact.linkedin_url]
    .map((v) => (v ?? "").trim())
    .filter(Boolean)
    .join(" | ");
  if (contactLine) children.push(body(contactLine, { size: 18 }));
  if ((contact.citizenship ?? "").trim())
    children.push(body((contact.citizenship ?? "").trim(), { size: 18 }));

  const order = sectionOrder(cv.arrangement);
  for (const key of order) {
    if (key === "summary") {
      const summary = (cv.summary ?? "").trim();
      if (!summary) continue;
      children.push(sectionHeader(SECTION_TITLES.summary));
      children.push(body(summary));
      continue;
    }

    if (key === "competencies") {
      const commercial = textList(cv.competencies?.commercial);
      const technical = textList(cv.competencies?.technical);
      if (!commercial.length && !technical.length) continue;
      children.push(sectionHeader(SECTION_TITLES.competencies));
      const groups: [string, string[]][] = technicalFirst(cv.arrangement)
        ? [
            ["Technical & Tools", technical],
            ["Commercial", commercial],
          ]
        : [
            ["Commercial", commercial],
            ["Technical & Tools", technical],
          ];
      for (const [label, items] of groups) {
        if (!items.length) continue;
        children.push(
          new Paragraph({
            spacing: { after: 60 },
            children: [
              new TextRun({ text: `${label}: `, font: FONT, size: 20, bold: true }),
              new TextRun({ text: items.join(" · "), font: FONT, size: 20 }),
            ],
          }),
        );
      }
      continue;
    }

    if (key === "experience") {
      const list = cv.experience ?? [];
      if (!list.length) continue;
      children.push(sectionHeader(SECTION_TITLES.experience));
      for (const exp of list) {
        const meta = experienceMeta[(exp.experience_id ?? "") as string];
        const period = formatRange(meta);
        children.push(
          new Paragraph({
            spacing: { before: 120, after: 20 },
            children: [
              new TextRun({
                text: (exp.role_title ?? "").trim() || "Role",
                font: FONT,
                size: 20,
                bold: true,
              }),
              new TextRun({
                text: exp.company ? ` — ${exp.company}` : "",
                font: FONT,
                size: 20,
              }),
            ],
          }),
        );
        const sub = [period, (meta?.location ?? "").trim()].filter(Boolean).join(" | ");
        if (sub) children.push(body(sub, { size: 18 }));
        for (const b of exp.bullets ?? []) {
          const t = (b?.text ?? "").trim();
          if (t) children.push(bulletParagraph(t));
        }
      }
      continue;
    }

    if (key === "built") {
      const list = cv.built ?? [];
      if (!list.length) continue;
      children.push(sectionHeader(SECTION_TITLES.built));
      for (const p of list) {
        children.push(
          new Paragraph({
            spacing: { before: 100, after: 20 },
            children: [
              new TextRun({
                text: (p?.name ?? "").trim() || "Project",
                font: FONT,
                size: 20,
                bold: true,
              }),
            ],
          }),
        );
        const desc = (p?.description ?? "").trim();
        if (desc)
          children.push(
            new Paragraph({
              spacing: { after: 60 },
              children: splitMetrics(desc).map(
                (part) =>
                  new TextRun({ text: part.text, font: FONT, size: 20, bold: part.bold }),
              ),
            }),
          );
      }
      continue;
    }

    // education / programs / languages
    const items = textList(cv[key]);
    if (!items.length) continue;
    children.push(sectionHeader(SECTION_TITLES[key]));
    for (const it of items) children.push(bulletParagraph(it));
  }

  return new Document({
    styles: { default: { document: { run: { font: FONT, size: 20 } } } },
    numbering: {
      config: [
        {
          reference: "cv-bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "•",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 360, hanging: 200 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4
            margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 },
          },
        },
        children,
      },
    ],
  });
}

export async function buildCvDocxBlob(args: {
  cv: CvOutput;
  contact: CvContact;
  experienceMeta: Record<string, ExperienceMeta>;
}): Promise<Blob> {
  const doc = buildCvDocument(args);
  return Packer.toBlob(doc);
}

// ---------- ATS validation ----------
export type AtsFinding = { level: "critical" | "warning"; label: string; detail: string };

export async function validateDocxForAts(blob: Blob): Promise<AtsFinding[]> {
  const findings: AtsFinding[] = [];
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());

  const docXml = (await zip.file("word/document.xml")?.async("string")) ?? "";

  if (/<w:tbl[\s>]/.test(docXml))
    findings.push({
      level: "critical",
      label: "Table found in document body",
      detail: "ATS parsers frequently scramble or drop table content. The CV must be single-column text.",
    });

  if (/<w:drawing[\s>]|<w:pict[\s>]|<a:blip[\s>]/.test(docXml))
    findings.push({
      level: "critical",
      label: "Image or drawing found",
      detail: "Images are not parsed by ATS and can break text extraction.",
    });

  if (/<w:txbxContent[\s>]|<v:shape[\s>]|<v:textbox[\s>]|<wps:txbx[\s>]/.test(docXml))
    findings.push({
      level: "critical",
      label: "Text box or VML shape found",
      detail: "Text inside shapes/text boxes is invisible to most ATS parsers.",
    });

  const cols = docXml.match(/<w:cols[^>]*w:num="(\d+)"/);
  if (cols && Number(cols[1]) > 1)
    findings.push({
      level: "critical",
      label: "Multi-column section layout",
      detail: `Section declares ${cols[1]} columns; ATS parsers read multi-column layouts out of order.`,
    });

  for (const name of Object.keys(zip.files)) {
    if (!/^word\/(header|footer)\d*\.xml$/.test(name)) continue;
    const xml = (await zip.file(name)?.async("string")) ?? "";
    const visible = [...xml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)]
      .map((m) => m[1].trim())
      .filter(Boolean)
      .join(" ");
    if (visible)
      findings.push({
        level: "critical",
        label: `Text found in ${name.includes("header") ? "header" : "footer"} part`,
        detail:
          "Many ATS parsers drop header/footer content entirely — contact details must live in the document body.",
      });
  }

  const fonts = new Set<string>();
  for (const name of ["word/document.xml", "word/styles.xml", "word/numbering.xml"]) {
    const xml = (await zip.file(name)?.async("string")) ?? "";
    for (const m of xml.matchAll(/w:(?:ascii|hAnsi|cs|eastAsia)="([^"]+)"/g)) fonts.add(m[1]);
  }
  const offenders = [...fonts].filter((f) => f !== FONT && !/^Symbol$|^Courier New$/.test(f));
  if (offenders.length)
    findings.push({
      level: "warning",
      label: "Non-Arial font in use",
      detail: `Found: ${offenders.join(", ")}. Arial is the safest ATS font.`,
    });

  return findings;
}

// ---------- Download helper ----------
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---------- PDF (print-to-PDF of a print-styled A4 render) ----------
function esc(s: string): string {
  return (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);
}

function metricHtml(text: string): string {
  return splitMetrics(text)
    .map((p) => (p.bold ? `<strong>${esc(p.text)}</strong>` : esc(p.text)))
    .join("");
}

export function buildCvPrintHtml(args: {
  cv: CvOutput;
  contact: CvContact;
  experienceMeta: Record<string, ExperienceMeta>;
  title: string;
}): string {
  const { cv, contact, experienceMeta, title } = args;
  const parts: string[] = [];

  parts.push(`<h1>${esc((contact.full_name ?? "").trim() || "Martin Pawluszek")}</h1>`);
  const contactLine = [contact.location, contact.phone, contact.email, contact.linkedin_url]
    .map((v) => (v ?? "").trim())
    .filter(Boolean)
    .join(" | ");
  if (contactLine) parts.push(`<p class="contact">${esc(contactLine)}</p>`);
  if ((contact.citizenship ?? "").trim())
    parts.push(`<p class="contact">${esc((contact.citizenship ?? "").trim())}</p>`);

  for (const key of sectionOrder(cv.arrangement)) {
    if (key === "summary") {
      const s = (cv.summary ?? "").trim();
      if (!s) continue;
      parts.push(`<h2>${SECTION_TITLES.summary}</h2><p>${metricHtml(s)}</p>`);
    } else if (key === "competencies") {
      const commercial = textList(cv.competencies?.commercial);
      const technical = textList(cv.competencies?.technical);
      if (!commercial.length && !technical.length) continue;
      parts.push(`<h2>${SECTION_TITLES.competencies}</h2>`);
      const groups: [string, string[]][] = technicalFirst(cv.arrangement)
        ? [
            ["Technical &amp; Tools", technical],
            ["Commercial", commercial],
          ]
        : [
            ["Commercial", commercial],
            ["Technical &amp; Tools", technical],
          ];
      for (const [label, items] of groups) {
        if (!items.length) continue;
        parts.push(`<p><strong>${label}:</strong> ${esc(items.join(" · "))}</p>`);
      }
    } else if (key === "experience") {
      const list = cv.experience ?? [];
      if (!list.length) continue;
      parts.push(`<h2>${SECTION_TITLES.experience}</h2>`);
      for (const exp of list) {
        const meta = experienceMeta[(exp.experience_id ?? "") as string];
        const sub = [formatRange(meta), (meta?.location ?? "").trim()].filter(Boolean).join(" | ");
        parts.push(
          `<p class="role"><strong>${esc((exp.role_title ?? "").trim() || "Role")}</strong>${
            exp.company ? ` — ${esc(exp.company)}` : ""
          }</p>`,
        );
        if (sub) parts.push(`<p class="sub">${esc(sub)}</p>`);
        const bullets = (exp.bullets ?? []).map((b) => (b?.text ?? "").trim()).filter(Boolean);
        if (bullets.length)
          parts.push(`<ul>${bullets.map((b) => `<li>${metricHtml(b)}</li>`).join("")}</ul>`);
      }
    } else if (key === "built") {
      const list = cv.built ?? [];
      if (!list.length) continue;
      parts.push(`<h2>${SECTION_TITLES.built}</h2>`);
      for (const p of list) {
        parts.push(`<p class="role"><strong>${esc((p?.name ?? "").trim() || "Project")}</strong></p>`);
        const d = (p?.description ?? "").trim();
        if (d) parts.push(`<p>${metricHtml(d)}</p>`);
      }
    } else {
      const items = textList(cv[key]);
      if (!items.length) continue;
      parts.push(
        `<h2>${SECTION_TITLES[key]}</h2><ul>${items
          .map((i) => `<li>${metricHtml(i)}</li>`)
          .join("")}</ul>`,
      );
    }
  }

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 18mm 17mm; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; line-height: 1.4; color: #000; }
  h1 { font-size: 18pt; color: #${ACCENT}; margin: 0 0 4pt; }
  h2 { font-size: 11pt; color: #${ACCENT}; text-transform: uppercase; margin: 14pt 0 6pt;
       border-bottom: 1px solid #${ACCENT}; padding-bottom: 2pt; }
  p { margin: 0 0 4pt; }
  p.contact { font-size: 9pt; }
  p.role { margin-top: 8pt; }
  p.sub { font-size: 9pt; color: #333; }
  ul { margin: 0 0 4pt; padding-left: 16pt; }
  li { margin-bottom: 3pt; }
  @media screen { body { max-width: 210mm; margin: 0 auto; padding: 18mm 17mm; } }
</style></head><body>${parts.join("")}</body></html>`;
}

export function printCvPdf(html: string): void {
  const w = window.open("", "_blank");
  if (!w) throw new Error("Popup blocked — allow popups to export the PDF");
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}

import type { ScriptBlock } from "@/domain/models";
import { toFountain } from "@/db/repos/script";

function safeFileName(title: string): string {
  return (title || "script").replace(/[/\\?%*:|"<>]/g, "-").trim() || "script";
}

export async function exportScriptBlocksToPdf(blocks: ScriptBlock[], title: string): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const body = toFountain(blocks);
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 72;
  const maxW = pageW - margin * 2;
  const lineH = 15;
  doc.setFont("courier", "normal");
  doc.setFontSize(12);
  const lines = doc.splitTextToSize(body, maxW) as string[];
  let y = margin;
  for (const line of lines) {
    if (y + lineH > pageH - margin) {
      doc.addPage();
      y = margin;
    }
    doc.text(line, margin, y);
    y += lineH;
  }
  doc.save(`${safeFileName(title)}.pdf`);
}

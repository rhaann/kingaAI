export interface PDFExportOptions {
  title: string;
  content: string;
  fontSize?: number;
  margin?: number;
  preserveFormatting?: boolean;
}

export async function exportToPDF(options: PDFExportOptions): Promise<void> {
  const { jsPDF } = await import('jspdf'); // <-- dynamic import (browser only)

  const { title, content, fontSize = 10, margin = 25 } = options;

  const pdf = new jsPDF();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const maxLineWidth = pageWidth - margin * 2;

  // Header
  pdf.setFillColor(248, 249, 250);
  pdf.rect(0, 0, pageWidth, 35, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.setTextColor(44, 62, 80);
  pdf.text(title, margin, 22);

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(108, 117, 125);
  const currentDate = new Date().toLocaleDateString('en-US');
  pdf.text(`Date: ${currentDate}`, pageWidth - margin - 40, 22);

  pdf.setDrawColor(224, 224, 224);
  pdf.setLineWidth(0.5);
  pdf.line(0, 35, pageWidth, 35);

  // Body
  let yPosition = 50;
  pdf.setTextColor(44, 62, 80);
  pdf.setFontSize(fontSize);
  pdf.setFont('helvetica', 'normal');

  const lines = content.split('\n');

  const addPageIfNeeded = () => {
    if (yPosition > pageHeight - margin) {
      pdf.addPage();
      yPosition = margin;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine ?? '';

    if (line.trim() === '') {
      yPosition += fontSize * 0.3;
      continue;
    }

    if (line.startsWith('##')) {
      yPosition += fontSize * 0.5;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(fontSize + 1);
      pdf.setTextColor(52, 73, 94);
      addPageIfNeeded();
      pdf.text(line.replace(/^##\s*/, ''), margin, yPosition);
      yPosition += fontSize + 2;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(fontSize);
      pdf.setTextColor(44, 62, 80);
      continue;
    }

    if (line.startsWith('*')) {
      const bulletText = line.replace(/^\*\s*/, '');
      const wrapped = pdf.splitTextToSize(bulletText, maxLineWidth - 10);
      for (let i = 0; i < wrapped.length; i++) {
        addPageIfNeeded();
        if (i === 0) {
          pdf.text('•', margin + 5, yPosition);
          pdf.text(wrapped[i], margin + 12, yPosition);
        } else {
          pdf.text(wrapped[i], margin + 12, yPosition);
        }
        yPosition += fontSize * 0.85;
      }
      yPosition += fontSize * 0.2;
      continue;
    }

    // Bold **...** blocks (very light handling)
    if (line.includes('**')) {
      const parts = line.split('**');
      let x = margin;
      for (let i = 0; i < parts.length; i++) {
        addPageIfNeeded();
        const bold = i % 2 === 1;
        pdf.setFont('helvetica', bold ? 'bold' : 'normal');
        const wrapped = pdf.splitTextToSize(parts[i], maxLineWidth - (x - margin));
        wrapped.forEach((w, idx) => {
          if (idx > 0) {
            yPosition += fontSize * 0.85;
            x = margin;
          }
          addPageIfNeeded();
          pdf.text(w, x, yPosition);
          x += pdf.getTextWidth(w);
        });
      }
      pdf.setFont('helvetica', 'normal');
      yPosition += fontSize * 0.85;
      continue;
    }

    // Regular paragraph
    const wrapped = pdf.splitTextToSize(line, maxLineWidth);
    for (const w of wrapped) {
      addPageIfNeeded();
      pdf.text(w, margin, yPosition);
      yPosition += fontSize * 0.85;
    }
    yPosition += fontSize * 0.3;
  }

  // Footer
  const totalPages = pdf.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(149, 165, 166);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Page ${i} of ${totalPages}`, pageWidth / 2 - 10, pageHeight - 10);
  }

  const fileName = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
  pdf.save(fileName);
}

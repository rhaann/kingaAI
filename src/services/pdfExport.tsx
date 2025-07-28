import jsPDF from 'jspdf';

export interface PDFExportOptions {
  title: string;
  content: string;
  fontSize?: number;
  margin?: number;
  preserveFormatting?: boolean;
}

export function exportToPDF(options: PDFExportOptions): void {
  const { title, content, fontSize = 10, margin = 25 } = options;
  
  const pdf = new jsPDF();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const maxLineWidth = pageWidth - (margin * 2);
  
  let yPosition = margin;
  
  // Simple clean header - light gray background
  pdf.setFillColor(248, 249, 250);
  pdf.rect(0, 0, pageWidth, 35, 'F');
  
  // Title in dark text
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.setTextColor(44, 62, 80);
  pdf.text(title, margin, 22);
  
  // Date in smaller text
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(108, 117, 125);
  const currentDate = new Date().toLocaleDateString('en-US');
  pdf.text(`Date: ${currentDate}`, pageWidth - margin - 40, 22);
  
  // Add subtle line under header
  pdf.setDrawColor(224, 224, 224);
  pdf.setLineWidth(0.5);
  pdf.line(0, 35, pageWidth, 35);
  
  yPosition = 50;
  
  // Reset text color to black for content
  pdf.setTextColor(44, 62, 80);
  pdf.setFontSize(fontSize);
  pdf.setFont('helvetica', 'normal');
  
  // Process content line by line with very tight spacing
  const lines = content.split('\n');
  
  lines.forEach((line) => {
    // Handle different content types
    if (line.trim() === '') {
      yPosition += fontSize * 0.1; // Very small space for empty lines
      return;
    }
    
    // Headers (lines starting with ##)
    if (line.startsWith('##')) {
      yPosition += fontSize * 0.5;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(fontSize + 1);
      pdf.setTextColor(52, 73, 94);
      const headerText = line.replace('##', '').trim();
      pdf.text(headerText, margin, yPosition);
      yPosition += fontSize + 2;
      
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(fontSize);
      pdf.setTextColor(44, 62, 80);
      return;
    }
    
    // Bold text (lines with **)
    if (line.includes('**')) {
      yPosition += fontSize * 0.1;
      const parts = line.split('**');
      let xPosition = margin;
      
      parts.forEach((part, index) => {
        if (yPosition > pageHeight - margin) {
          pdf.addPage();
          yPosition = margin;
          xPosition = margin;
        }
        
        if (index % 2 === 1) {
          pdf.setFont('helvetica', 'bold');
        } else {
          pdf.setFont('helvetica', 'normal');
        }
        
        const wrappedLines = pdf.splitTextToSize(part, maxLineWidth - (xPosition - margin));
        wrappedLines.forEach((wrappedLine: string, lineIndex: number) => {
          if (lineIndex > 0) {
            yPosition += fontSize * 0.85;
            xPosition = margin;
          }
          pdf.text(wrappedLine, xPosition, yPosition);
          xPosition += pdf.getTextWidth(wrappedLine);
        });
      });
      
      yPosition += fontSize * 0.85;
      pdf.setFont('helvetica', 'normal');
      return;
    }
    
    // Bullet points (lines starting with *)
    if (line.startsWith('*')) {
      const bulletText = line.replace(/^\*\s*/, '');
      const wrappedBulletLines = pdf.splitTextToSize(bulletText, maxLineWidth - 10);
      
      wrappedBulletLines.forEach((wrappedLine: string, index: number) => {
        if (yPosition > pageHeight - margin) {
          pdf.addPage();
          yPosition = margin;
        }
        
        if (index === 0) {
          pdf.text('•', margin + 5, yPosition);
          pdf.text(wrappedLine, margin + 12, yPosition);
        } else {
          pdf.text(wrappedLine, margin + 12, yPosition);
        }
        yPosition += fontSize * 0.85; // Very tight spacing for bullets
      });
      yPosition += fontSize * 0.2; // Minimal extra space after bullet points
      return;
    }
    
    // Regular paragraphs - very tight spacing
    const wrappedLines = pdf.splitTextToSize(line, maxLineWidth);
    wrappedLines.forEach((wrappedLine: string) => {
      if (yPosition > pageHeight - margin) {
        pdf.addPage();
        yPosition = margin;
      }
      pdf.text(wrappedLine, margin, yPosition);
      yPosition += fontSize * 0.85; // Much tighter - lines almost touching
    });
    yPosition += fontSize * 0.3; // Very minimal space between paragraphs
  });
  
  // Add footer
  const totalPages = pdf.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(149, 165, 166);
    pdf.setFont('helvetica', 'normal');
    pdf.text(
      `Page ${i} of ${totalPages}`, 
      pageWidth / 2 - 10, 
      pageHeight - 10
    );
  }
  
  const fileName = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
  pdf.save(fileName);
}
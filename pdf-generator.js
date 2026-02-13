const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Generate a professional enterprise-grade PDF compliance report
 */
function generateCompliancePDF(scanResults, outputPath) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
        info: {
          Title: 'iOS App Store Compliance Report',
          Author: 'Lumen AI Solutions',
          Subject: 'App Store Review Guidelines Compliance Analysis',
          Creator: 'Lumen iOS Compliance Scanner'
        }
      });

      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      // ========================================
      // HEADER
      // ========================================
      doc.fontSize(24).font('Helvetica-Bold')
         .text('iOS App Store', 50, 50)
         .text('Compliance Report', 50, 80);
      
      doc.fontSize(10).font('Helvetica')
         .fillColor('#666666')
         .text(`Generated: ${new Date().toLocaleString()}`, 50, 120)
         .text(`Powered by Lumen AI Solutions`, 50, 135);

      // Separator line
      doc.moveTo(50, 155).lineTo(562, 155).stroke('#CCCCCC');

      let y = 175;

      // ========================================
      // EXECUTIVE SUMMARY
      // ========================================
      doc.fontSize(16).font('Helvetica-Bold').fillColor('#000000')
         .text('Executive Summary', 50, y);
      
      y += 30;

      // Overall Status Box
      const status = scanResults.summary?.status || 'UNKNOWN';
      const statusColor = status === 'GREENLIT' ? '#10B981' : 
                         status === 'WARNING' ? '#F59E0B' : '#EF4444';
      
      doc.rect(50, y, 512, 60).fillAndStroke(statusColor, statusColor);
      doc.fontSize(20).font('Helvetica-Bold').fillColor('#FFFFFF')
         .text(status, 50, y + 20, { width: 512, align: 'center' });
      
      y += 80;

      // Key Metrics
      doc.fontSize(12).font('Helvetica').fillColor('#000000')
         .text(`Critical Issues: ${scanResults.summary?.critical || 0}`, 50, y)
         .text(`Warnings: ${scanResults.summary?.warnings || 0}`, 200, y)
         .text(`Info: ${scanResults.summary?.info || 0}`, 350, y);
      
      y += 30;

      // Risk Assessment (AI-powered)
      if (scanResults.aiAnalysis?.riskLevel) {
        doc.fontSize(14).font('Helvetica-Bold')
           .text('AI Risk Assessment:', 50, y);
        y += 20;
        doc.fontSize(11).font('Helvetica')
           .text(scanResults.aiAnalysis.riskLevel, 50, y);
        y += 25;
      }

      // ========================================
      // DETAILED FINDINGS
      // ========================================
      doc.fontSize(16).font('Helvetica-Bold')
         .text('Detailed Findings', 50, y);
      y += 30;

      const findings = scanResults.findings || [];
      
      findings.forEach((finding, index) => {
        // Check if we need a new page
        if (y > 700) {
          doc.addPage();
          y = 50;
        }

        // Severity badge
        const severityColors = {
          'CRITICAL': '#EF4444',
          'WARNING': '#F59E0B',
          'INFO': '#3B82F6'
        };
        const color = severityColors[finding.severity] || '#6B7280';

        doc.rect(50, y, 100, 20).fillAndStroke(color, color);
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#FFFFFF')
           .text(finding.severity, 50, y + 5, { width: 100, align: 'center' });
        
        // Finding title
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#000000')
           .text(finding.title || `Finding #${index + 1}`, 160, y + 3);
        
        y += 30;

        // Description
        doc.fontSize(10).font('Helvetica').fillColor('#333333')
           .text(finding.description || 'No description', 50, y, { width: 512 });
        
        y += doc.heightOfString(finding.description || 'No description', { width: 512 }) + 10;

        // Guideline reference
        if (finding.guideline) {
          doc.fontSize(9).fillColor('#666666')
             .text(`📋 Guideline: ${finding.guideline}`, 50, y);
          y += 15;
        }

        // Fix suggestion (AI-powered)
        if (finding.fixSuggestion) {
          doc.fontSize(9).font('Helvetica-Bold').fillColor('#10B981')
             .text('✓ Suggested Fix:', 50, y);
          y += 12;
          doc.font('Helvetica').fillColor('#333333')
             .text(finding.fixSuggestion, 65, y, { width: 497 });
          y += doc.heightOfString(finding.fixSuggestion, { width: 497 }) + 15;
        }

        // Separator
        doc.moveTo(50, y).lineTo(562, y).stroke('#E5E7EB');
        y += 20;
      });

      // ========================================
      // AI RECOMMENDATIONS
      // ========================================
      if (scanResults.aiAnalysis?.recommendations) {
        if (y > 650) {
          doc.addPage();
          y = 50;
        }

        doc.fontSize(16).font('Helvetica-Bold').fillColor('#000000')
           .text('AI-Powered Recommendations', 50, y);
        y += 30;

        scanResults.aiAnalysis.recommendations.forEach((rec, index) => {
          if (y > 700) {
            doc.addPage();
            y = 50;
          }

          doc.fontSize(11).font('Helvetica-Bold')
             .text(`${index + 1}. ${rec.title}`, 50, y);
          y += 18;
          doc.fontSize(10).font('Helvetica').fillColor('#333333')
             .text(rec.description, 65, y, { width: 497 });
          y += doc.heightOfString(rec.description, { width: 497 }) + 20;
        });
      }

      // ========================================
      // FOOTER
      // ========================================
      doc.addPage();
      y = 350;
      doc.fontSize(10).font('Helvetica').fillColor('#999999')
         .text('This report was generated by Lumen iOS Compliance Scanner', 50, y, { align: 'center', width: 512 })
         .text('Powered by Lumen AI Solutions', 50, y + 15, { align: 'center', width: 512 })
         .text('https://lumen-dashboard.onrender.com', 50, y + 30, { align: 'center', width: 512 });

      doc.end();

      stream.on('finish', () => {
        resolve(outputPath);
      });

      stream.on('error', reject);

    } catch (error) {
      reject(error);
    }
  });
}

module.exports = { generateCompliancePDF };

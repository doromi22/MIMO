const fs = require('fs');
const { PDFDocument } = require('pdf-lib');
const path = require('path');

async function addBlankPageToPdf(inputPath, outputPath) {
    const existingPdfBytes = fs.readFileSync(inputPath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const pages = pdfDoc.getPages();
    const { width, height } = pages[0].getSize();

    const blankPage = pdfDoc.addPage([width, height]);
    pdfDoc.insertPage(0, blankPage);

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputPath, pdfBytes);
}

async function removeBlankPageFromPdf(inputPath, outputPath) {
    const existingPdfBytes = fs.readFileSync(inputPath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const pages = pdfDoc.getPages();

    if (pages.length > 1) {
        pdfDoc.removePage(0);
    }

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputPath, pdfBytes);
}

module.exports = {
    addBlankPageToPdf,
    removeBlankPageFromPdf
};
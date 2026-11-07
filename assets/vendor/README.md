# Vendored browser libraries

FreightKit serves these libraries locally so document comparisons do not depend on a third-party CDN:

- **SheetJS Community Edition 0.20.3** (`sheetjs/xlsx.full.min.js`) — reads XLSX files and creates XLSX reports.
- **PDF.js 5.6.205** (`pdfjs/pdf.min.js`, `pdfjs/pdf.worker.min.js`) — extracts selectable text from text-based PDFs in the browser. The ESM bundles use `.js` extensions so static hosts serve them with a JavaScript MIME type.

Both projects are distributed under the Apache License 2.0. Their project pages and license texts:

- SheetJS: https://github.com/SheetJS/sheetjs/blob/master/LICENSE
- PDF.js: https://github.com/mozilla/pdf.js/blob/master/LICENSE

PDF.js extracts selectable text only. It does not perform OCR on scanned pages or images.

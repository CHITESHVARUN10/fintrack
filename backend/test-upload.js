const fs = require('fs');
const path = require('path');

async function run() {
  const dummyPdf = path.join(__dirname, 'dummy.pdf');
  fs.writeFileSync(dummyPdf, '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n');

  // Need to log in or get a token.
  // Or I can just simulate calling the function directly.
}
run();

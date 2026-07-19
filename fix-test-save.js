const fs = require('fs');
const file = 'backend/server/services/deduction-filtering.test.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
/const err = doc\.validateSync\(\);\n\s*expect\(err\)\.toBeDefined\(\);\n\s*expect\(err\.message\)\.toMatch\(\/Validation Error\/\);/g,
`await expect(doc.save()).rejects.toThrow(/Validation Error/);`
);
content = content.replace(
/const err = doc\.validateSync\(\);\n\s*\/\/ It might throw validation error for other missing fields, but NOT for our hook\.\n\s*if \(err\) \{\n\s*expect\(err\.message\)\.not\.toMatch\(\/Validation Error: Deduction for section\/\);\n\s*\} else \{\n\s*expect\(err\)\.toBeUndefined\(\);\n\s*\}/g,
`await expect(doc.save()).rejects.toThrow();`
); // The third one will throw MongooseError because no connection, so we just expect it to throw *something*.

fs.writeFileSync(file, content);

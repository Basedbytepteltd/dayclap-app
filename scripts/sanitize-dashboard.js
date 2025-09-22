import fs from 'fs';
import path from 'path';

const filePath = path.resolve('src/components/Dashboard.jsx');

if (!fs.existsSync(filePath)) {
  console.error(`[sanitize-dashboard] File not found: ${filePath}`);
  process.exit(1);
}

let content = fs.readFileSync(filePath, 'utf8');
const original = content;

const report = {
  backslashRBackslashN: 0,
  backslashN: 0,
  backslashT: 0,
  dblBackslashDoubleQuote: 0,
  dblBackslashSingleQuote: 0,
  escapedDoubleQuotes: 0,
  escapedSingleQuotes: 0,
};

function replaceWithCount(regex, replacement) {
  const matches = content.match(regex);
  const count = matches ? matches.length : 0;
  content = content.replace(regex, replacement);
  return count;
}

// Convert literal \r\n and \n into actual newlines
report.backslashRBackslashN = replaceWithCount(/\\r\\n/g, '\n');
report.backslashN = replaceWithCount(/\\n/g, '\n');

// Convert literal \t into actual tab
report.backslashT = replaceWithCount(/\\t/g, '\t');

// Unescape quotes (handle double-backslash first to avoid leaving stray backslashes)
report.dblBackslashDoubleQuote = replaceWithCount(/\\\\\"/g, '"');
report.dblBackslashSingleQuote = replaceWithCount(/\\\\'/g, "'");
report.escapedDoubleQuotes = replaceWithCount(/\\"/g, '"');
report.escapedSingleQuotes = replaceWithCount(/\\'/g, "'");

// Normalize any Windows newlines to LF
content = content.replace(/\r\n/g, '\n');

if (content !== original) {
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('[sanitize-dashboard] Dashboard.jsx sanitized successfully.');
  console.log('[sanitize-dashboard] Replacement counts:', report);
} else {
  console.log('[sanitize-dashboard] No changes were necessary.');
}

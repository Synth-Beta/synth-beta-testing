import fs from 'fs';

const inputPath = '/Users/sloiterstein/Downloads/City Upload 2 - Fixed.csv';
const outputPath = '/Users/sloiterstein/Downloads/City Upload 2 - Deduped.csv';

const content = fs.readFileSync(inputPath, 'utf-8');
const lines = content.split('\n');

const seen = new Map(); // key -> {line, population}
const outputLines = [];
let duplicateCount = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  
  if (i === 0) {
    // Header row
    outputLines.push(line);
    continue;
  }
  
  if (!line) continue;
  
  // Parse fields to get the unique key (normalized_name, state, country)
  const fields = [];
  let currentField = '';
  let inQuotes = false;
  
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    if (char === '"') {
      if (inQuotes && line[j + 1] === '"') {
        currentField += '"';
        j++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(currentField);
      currentField = '';
    } else {
      currentField += char;
    }
  }
  fields.push(currentField);
  
  // Create unique key from normalized_name (1), state (2), country (3)
  const normalizedName = fields[1] || '';
  const state = fields[2] || '';
  const country = fields[3] || '';
  const population = parseInt(fields[8]) || 0;
  
  const key = `${normalizedName.toLowerCase()}|${state.toLowerCase()}|${country.toLowerCase()}`;
  
  if (seen.has(key)) {
    // Duplicate - keep the one with higher population
    const existing = seen.get(key);
    if (population > existing.population) {
      seen.set(key, { line, population });
    }
    duplicateCount++;
  } else {
    seen.set(key, { line, population });
  }
}

// Build output from map
for (const { line } of seen.values()) {
  outputLines.push(line);
}

fs.writeFileSync(outputPath, outputLines.join('\n'), 'utf-8');

console.log(`Original rows: ${lines.length - 1}`);
console.log(`Duplicates removed: ${duplicateCount}`);
console.log(`Final rows: ${outputLines.length - 1}`);
console.log(`Output saved to: ${outputPath}`);

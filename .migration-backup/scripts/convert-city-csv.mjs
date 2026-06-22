import fs from 'fs';

const inputPath = '/Users/sloiterstein/Downloads/City Upload 2.csv';
const outputPath = '/Users/sloiterstein/Downloads/City Upload 2 - Fixed.csv';

const content = fs.readFileSync(inputPath, 'utf-8');
const lines = content.split('\n');

const outputLines = [];
let successCount = 0;
let errorCount = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  
  if (i === 0) {
    // Header row - keep as is
    outputLines.push(line);
    continue;
  }
  
  if (!line) {
    continue; // Skip empty lines
  }
  
  // Parse the CSV line - need to handle the JSON array in aliases column
  // The JSON array is wrapped in double quotes and starts with [" and ends with ]"
  // Format: uuid,name,state,country,lat,lng,"[""alias1"",""alias2""]",count,pop,created,updated
  
  // Find the aliases JSON array - it's the 7th field (index 6)
  // Split carefully, respecting quoted fields
  
  const fields = [];
  let currentField = '';
  let inQuotes = false;
  let chars = line.split('');
  
  for (let j = 0; j < chars.length; j++) {
    const char = chars[j];
    
    if (char === '"') {
      // Check if it's an escaped quote (doubled)
      if (inQuotes && chars[j + 1] === '"') {
        currentField += '"';
        j++; // Skip the next quote
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
  fields.push(currentField); // Last field
  
  if (fields.length < 11) {
    console.error(`Row ${i + 1}: Expected 11 fields, got ${fields.length}`);
    errorCount++;
    continue;
  }
  
  // Field 6 (index 6) is aliases
  let aliases = fields[6];
  
  try {
    if (aliases && aliases.startsWith('[')) {
      // It's a JSON array
      const aliasesArray = JSON.parse(aliases);
      // Convert to PostgreSQL array format
      const pgArray = '{' + aliasesArray.map(item => {
        // Escape double quotes by doubling them
        const escaped = item.replace(/"/g, '""');
        // Wrap in quotes if contains special chars
        if (escaped.includes(',') || escaped.includes('"') || escaped.includes('\\') || 
            escaped.includes('{') || escaped.includes('}') || escaped.includes("'")) {
          return `"${escaped}"`;
        }
        return escaped;
      }).join(',') + '}';
      fields[6] = pgArray;
    } else {
      fields[6] = '{}';
    }
    
    // Reconstruct the CSV line with proper quoting
    const outputLine = fields.map((field, idx) => {
      // Quote fields that contain commas, quotes, or newlines
      if (field.includes(',') || field.includes('"') || field.includes('\n')) {
        return '"' + field.replace(/"/g, '""') + '"';
      }
      return field;
    }).join(',');
    
    outputLines.push(outputLine);
    successCount++;
  } catch (e) {
    console.error(`Row ${i + 1}: Error - ${e.message}`);
    errorCount++;
  }
  
  if ((i + 1) % 10000 === 0) {
    console.log(`Processed ${i + 1} rows...`);
  }
}

fs.writeFileSync(outputPath, outputLines.join('\n'), 'utf-8');
console.log(`\nDone!`);
console.log(`Successfully converted: ${successCount} rows`);
console.log(`Errors: ${errorCount} rows`);
console.log(`Output saved to: ${outputPath}`);

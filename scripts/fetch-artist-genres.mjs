/**
 * Fetch genres for an artist using the Python script
 * This is a Node.js wrapper around the Python genre-fetching script
 */

import { spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Fetch genres for a single artist using external APIs
 * @param {Object} artistData - Artist data with name, id, and external_identifiers
 * @returns {Promise<{genres: string[], source: string}>}
 */
export async function fetchGenresForArtist(artistData) {
  const { name, id, external_identifiers } = artistData;
  
  // Create a temporary CSV file with the artist data
  const tempDir = path.join(__dirname, '..', 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  if (!fs.existsSync(tempDir)) {
    throw new Error(`Failed to create temp directory: ${tempDir}`);
  }
  
  const tempCsv = path.join(tempDir, `artist_${id}_${Date.now()}.csv`);
  const tempOutput = path.join(tempDir, `artist_${id}_${Date.now()}_output`);
  
  try {
    // Create CSV with header and one row
    const externalIdsStr = external_identifiers 
      ? JSON.stringify(external_identifiers) 
      : '[]';
    const csvContent = `id,name,genres,external_identifiers\n"${id}","${name.replace(/"/g, '""')}","[]","${externalIdsStr.replace(/"/g, '""')}"`;
    fs.writeFileSync(tempCsv, csvContent, 'utf-8');
    
    // Find the Python script
    const pythonScript = path.join(__dirname, 'process_artists_without_genres.py');
    // If not found, try the attached file location
    const altPythonScript = '/Users/sloiterstein/Library/Messages/Attachments/82/02/B4CEC5AD-C96B-4712-9377-AFD7DFEA0B78/process_artists_without_genres.py';
    
    let scriptPath = pythonScript;
    if (!fs.existsSync(scriptPath)) {
      scriptPath = altPythonScript;
    }
    
    if (!fs.existsSync(scriptPath)) {
      console.warn(`⚠️  Python script not found at ${scriptPath}, skipping genre fetch for ${name}`);
      return { genres: [], source: 'None' };
    }
    
    // Run Python script
    return new Promise((resolve, reject) => {
      const python = spawn('python3', [scriptPath, tempCsv, '--output-dir', tempDir], {
        cwd: path.dirname(scriptPath) || __dirname,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let stdout = '';
      let stderr = '';
      
      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      python.on('close', (code) => {
        // Clean up temp CSV
        try {
          if (fs.existsSync(tempCsv)) {
            fs.unlinkSync(tempCsv);
          }
        } catch (e) {
          // Ignore cleanup errors
        }
        
        if (code !== 0) {
          console.warn(`⚠️  Python script exited with code ${code} for ${name}: ${stderr}`);
          resolve({ genres: [], source: 'None' });
          return;
        }
        
        // Parse the SQL output file to extract genres
        const sqlFile = fs.readdirSync(tempDir)
          .find(f => f.startsWith(`artist_${id}_`) && f.endsWith('_updates.sql'));
        
        if (sqlFile) {
          const sqlPath = path.join(tempDir, sqlFile);
          const sqlContent = fs.readFileSync(sqlPath, 'utf-8');
          
          // Extract genres from SQL: UPDATE artists SET genres = '["genre1","genre2"]'::jsonb WHERE id = '...';
          const match = sqlContent.match(/genres = '(\[.*?\])'::jsonb/);
          if (match) {
            try {
              const genres = JSON.parse(match[1]);
              // Clean up temp files
              try {
                fs.unlinkSync(sqlPath);
                const reportFile = sqlFile.replace('_updates.sql', '_report.md');
                const reportPath = path.join(tempDir, reportFile);
                if (fs.existsSync(reportPath)) {
                  fs.unlinkSync(reportPath);
                }
              } catch (e) {
                // Ignore cleanup errors
              }
              
              // Extract source from report if available
              const reportMatch = sqlContent.match(/Found via (.+?):/);
              const source = reportMatch ? reportMatch[1] : 'External API';
              
              resolve({ genres, source });
              return;
            } catch (e) {
              console.warn(`⚠️  Failed to parse genres from SQL for ${name}: ${e.message}`);
            }
          }
        }
        
        resolve({ genres: [], source: 'None' });
      });
      
      python.on('error', (error) => {
        console.warn(`⚠️  Failed to run Python script for ${name}: ${error.message}`);
        resolve({ genres: [], source: 'None' });
      });
      
      // Set timeout (30 seconds)
      setTimeout(() => {
        python.kill();
        resolve({ genres: [], source: 'None' });
      }, 30000);
    });
  } catch (error) {
    console.warn(`⚠️  Error fetching genres for ${name}: ${error.message}`);
    return { genres: [], source: 'None' };
  }
}

/**
 * Check if genres array is empty or invalid
 */
export function isEmptyGenres(genres) {
  if (!genres) return true;
  if (!Array.isArray(genres)) return true;
  if (genres.length === 0) return true;
  // Check if all genres are empty strings or null
  return genres.every(g => !g || (typeof g === 'string' && g.trim() === ''));
}

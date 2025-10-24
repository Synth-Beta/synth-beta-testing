import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Load environment variables
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   VITE_SUPABASE_URL:', !!supabaseUrl);
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', !!supabaseServiceKey);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
  try {
    console.log('🚀 Applying genre-first algorithm fix...');
    
    // Read the migration file
    const migrationPath = path.join(process.cwd(), 'supabase/migrations/20250217000005_fix_genre_first_promotions.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Split the SQL into individual statements
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    console.log(`📝 Found ${statements.length} SQL statements to execute`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        console.log(`⚡ Executing statement ${i + 1}/${statements.length}...`);
        
        const { error } = await supabase.rpc('exec_sql', { sql: statement });
        
        if (error) {
          console.error(`❌ Error in statement ${i + 1}:`, error);
          console.error('Statement:', statement.substring(0, 100) + '...');
          throw error;
        }
        
        console.log(`✅ Statement ${i + 1} executed successfully`);
      }
    }
    
    console.log('🎉 Genre-first algorithm fix applied successfully!');
    console.log('✅ The personalized feed should now use the correct algorithm with promotions');
    
  } catch (error) {
    console.error('❌ Failed to apply migration:', error);
    process.exit(1);
  }
}

// Run the migration
applyMigration();

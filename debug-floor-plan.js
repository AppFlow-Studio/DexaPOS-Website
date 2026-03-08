/**
 * Debug script to check floor_plan_objects in database
 * Run with: node debug-floor-plan.js
 */

const fs = require('fs');
const path = require('path');

// Read .env file
const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const lines = envContent.split('\n');

let SUPABASE_URL = '';
let SUPABASE_ANON_KEY = '';

for (const line of lines) {
  if (line.includes('NEXT_PUBLIC_SUPABASE_URL')) {
    SUPABASE_URL = line.split('=')[1].trim();
  }
  if (line.includes('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')) {
    SUPABASE_ANON_KEY = line.split('=')[1].trim();
  }
}

console.log('Supabase Config:');
console.log('- URL:', SUPABASE_URL ? '✓ Found' : '✗ Not found');
console.log('- Key:', SUPABASE_ANON_KEY ? '✓ Found' : '✗ Not found');

// Now check the database
const { createClient } = require('@supabase/supabase-js');

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing Supabase configuration');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkDatabase() {
  console.log('\n📊 Checking floor_plan_objects in database...\n');

  try {
    // Get all floor plans
    const { data: floorPlans, error: fpError } = await supabase
      .from('floor_plans')
      .select('id, name, description')
      .limit(5);

    if (fpError) {
      console.error('❌ Error fetching floor plans:', fpError);
      return;
    }

    console.log(`✓ Found ${floorPlans.length} floor plans:`);
    floorPlans.forEach(fp => {
      console.log(`  - ${fp.name} (${fp.id.substring(0, 8)}...)`);
    });

    // For each floor plan, get objects
    for (const fp of floorPlans) {
      const { data: objects, error: objError } = await supabase
        .from('floor_plan_objects')
        .select('id, name, category, shape_id, x, y')
        .eq('floor_plan_id', fp.id);

      if (objError) {
        console.error(`❌ Error fetching objects for ${fp.name}:`, objError);
        continue;
      }

      console.log(`\n  Objects in "${fp.name}" (${objects.length} total):`);
      if (objects.length === 0) {
        console.log('    (empty)');
      } else {
        objects.forEach(obj => {
          console.log(`    - ${obj.name} (${obj.category}) @ (${obj.x}, ${obj.y})`);
        });
      }
    }

  } catch (err) {
    console.error('❌ Unexpected error:', err);
  }

  process.exit(0);
}

checkDatabase();

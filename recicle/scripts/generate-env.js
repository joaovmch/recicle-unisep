const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { SUPABASE_URL, SUPABASE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ SUPABASE_URL ou SUPABASE_KEY ausentes. Crie o .env a partir do .env.example.');
  process.exit(1);
}

const content = `export const environment = {
  production: ${process.env.NODE_ENV === 'production'},
  supabaseUrl: '${SUPABASE_URL}',
  supabaseKey: '${SUPABASE_KEY}',
};
`;

const targetDir = path.join(__dirname, '../src/environments');
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

fs.writeFileSync(path.join(targetDir, 'environment.ts'), content);
console.log('✅ environment.ts gerado a partir do .env');

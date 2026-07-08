import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envText = fs.readFileSync('.env', 'utf8');

const env = {};
envText.split(/\r?\n/).forEach((line) => {
  const [key, ...rest] = line.split('=');
  if (key && rest.length) {
    env[key.trim()] = rest.join('=').trim();
  }
});

const supabase = createClient(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_ANON_KEY
);

const APP_ID = 'prono_ligue1_lm';

const testData = {
  test: true,
  message: 'Connexion PC téléphone OK',
  date: new Date().toISOString()
};

const { error: saveError } = await supabase
  .from('app_state')
  .upsert({
    id: APP_ID,
    data: testData,
    updated_at: new Date().toISOString()
  });

if (saveError) {
  console.error('❌ Erreur sauvegarde:', saveError);
  process.exit(1);
}

const { data, error: loadError } = await supabase
  .from('app_state')
  .select('data')
  .eq('id', APP_ID)
  .single();

if (loadError) {
  console.error('❌ Erreur lecture:', loadError);
  process.exit(1);
}

console.log('✅ Connexion Supabase OK');
console.log(data.data);

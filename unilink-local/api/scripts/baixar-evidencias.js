// Baixa as fotos do bucket "evidencias-chamados" do Supabase para o volume local de uploads.
// Lê os caminhos (storage_path) da tabela chamado_evidencias JÁ IMPORTADA no Postgres local.
// Uso (depois de importar o banco):
//   docker compose run --rm -e SUPABASE_URL=https://xxxx.supabase.co -e SUPABASE_SERVICE_ROLE_KEY=... api node scripts/baixar-evidencias.js
// Use uma service_role key NOVA (rotacionada). Pode ser rodado de novo: pula o que já existe.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, UPLOAD_DIR = '/app/uploads' } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); }
const BUCKET = 'evidencias-chamados';
const raiz = path.resolve(UPLOAD_DIR);

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const { rows } = await pool.query('select storage_path from chamado_evidencias order by criado_em');
  console.log(`${rows.length} evidência(s) para conferir.`);
  let baixadas = 0, puladas = 0, falhas = 0;
  for (const { storage_path } of rows) {
    const destino = path.resolve(raiz, storage_path);
    if (!destino.startsWith(raiz + path.sep)) { console.warn('Caminho suspeito, ignorado:', storage_path); falhas++; continue; }
    if (fs.existsSync(destino)) { puladas++; continue; }
    const url = `${SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/${BUCKET}/${storage_path.split('/').map(encodeURIComponent).join('/')}`;
    try {
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, apikey: SUPABASE_SERVICE_ROLE_KEY } });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.writeFileSync(destino, Buffer.from(await resp.arrayBuffer()));
      baixadas++;
    } catch (e) { console.warn(`Falhou ${storage_path}: ${e.message}`); falhas++; }
  }
  console.log(`Concluído: ${baixadas} baixadas, ${puladas} já existiam, ${falhas} falhas.`);
  await pool.end();
  process.exit(falhas ? 2 : 0);
})().catch(e => { console.error('Erro:', e.message); process.exit(1); });

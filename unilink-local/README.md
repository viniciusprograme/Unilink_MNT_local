# UNILINK — hospedagem local

Aplicação interna em Docker Compose: Caddy termina HTTPS, nginx serve o frontend e encaminha `/api`, Express atende a API e PostgreSQL armazena os dados. O frontend, inclusive bibliotecas, fontes e estilos, é servido localmente e funciona sem acesso à internet.

```text
Notebooks/PCs ──HTTPS :443──► Caddy ──► nginx ──/api──► Express ──► PostgreSQL
                                               └──────► arquivos locais de evidências
```

## 1. Requisitos e configuração

- Docker Engine e Docker Compose plugin.
- DNS interno ou registro `hosts` apontando `unilink.lan` para o IP do servidor.
- Permitir TCP 80/443 apenas na rede interna; não expor o host à internet.
- Node.js/npm somente para reconstruir os assets do frontend.

Crie os segredos no servidor e proteja o arquivo:

```bash
cp .env.example .env
openssl rand -hex 16
openssl rand -hex 32
chmod 600 .env
```

Use o primeiro valor em `DB_PASSWORD` e o segundo em `JWT_SECRET`. Nunca reutilize chaves do Supabase. `CORS_ORIGIN` pode ficar vazio porque o frontend e a API usam a mesma origem.

## 2. Construir e subir

Os assets offline gerados estão no repositório. Para reconstruí-los após alteração das dependências ou do frontend:

```bash
cd web
npm ci
npm run build
```

Revise e versione juntos `web/vendor/`, `web/css/tailwind.css` e `web/vendor/README.md`. O build não precisa de serviços CDN em runtime.

Suba a aplicação:

```bash
docker compose up -d --build
docker compose ps
curl https://unilink.lan/api/health
```

Crie o administrador inicial, se necessário:

```bash
docker compose run --rm api node scripts/criar-admin.js admin 'Use-Uma-Senha-Unica'
```

O banco e a API não publicam portas no host; o único ponto de entrada da aplicação é o Caddy nas portas 80/443. O Caddy cria uma CA interna. Exporte somente o certificado público raiz e instale-o como autoridade confiável nos computadores autorizados:

```bash
docker compose exec caddy cat /data/caddy/pki/authorities/local/root.crt > unilink-root.crt
```

Windows (PowerShell como administrador):

```powershell
certutil -addstore -f Root .\unilink-root.crt
```

Não exporte nem distribua a chave privada da CA. Preserve o volume `caddy_data` em backup. Depois da instalação do certificado, teste a URL HTTPS e a câmera em um navegador da rede.

## 3. Migração do Supabase

Antes de começar, rotacione a chave exposta no provedor, faça o inventário de dados e proteja qualquer dump com hashes de senha. Ações na conta cloud não são executadas por estes scripts.

Exporte os dados e hashes de senha:

```bash
export SUPABASE_DB_URL='postgresql://...'
bash scripts/1-exportar-supabase.sh
```

Importe no banco local vazio e confira as contagens com o inventário do Supabase:

```bash
bash scripts/2-importar-local.sh
docker compose up -d --build
```

Baixe as evidências usando uma chave `service_role` nova, fornecida somente no ambiente do comando:

```bash
docker compose run --rm \
  -e SUPABASE_URL='https://SEU-PROJETO.supabase.co' \
  -e SUPABASE_SERVICE_ROLE_KEY='CHAVE_NOVA' \
  api node scripts/baixar-evidencias.js
```

Confirme contagens, logins, amostras de chamados e arquivos. Apague os arquivos sensíveis em `dump/` após a validação; eles são ignorados pelo Git.

## 4. Backup e teste de restauração

O backup requer o disco/NAS montado em `/mnt/backup` e grava snapshots em `/mnt/backup/unilink/{daily,weekly,monthly}`. Cada snapshot contém dump PostgreSQL, arquivo de uploads e checksums. A retenção é de 14 diários, 8 semanais e 12 mensais.

Configure a cópia offsite e, se disponível, um comando executável de alerta que receba a mensagem como único argumento:

```bash
BACKUP_OFFSITE_DIR=/mnt/nas/unilink \
BACKUP_OFFSITE_MOUNTPOINT=/mnt/nas \
BACKUP_AGE_RECIPIENT='age1...' \
BACKUP_ALERT_COMMAND=/usr/local/bin/notify-unilink-backup-failure \
bash scripts/backup.sh
```

Instale `age` no servidor. Guarde a chave privada `age` fora do servidor e configure no ambiente apenas o destinatário público. Sem `BACKUP_OFFSITE_DIR`, o script informa explicitamente que o snapshot não tem cópia offsite. Em desenvolvimento, sem disco montado, pode-se usar `BACKUP_ROOT=./backups BACKUP_REQUIRE_MOUNT=false`; isso não substitui o backup de produção.

Agende diariamente às 02:00 (ajuste os caminhos e variáveis de acordo com o servidor):

```cron
0 2 * * * cd /opt/unilink && BACKUP_OFFSITE_DIR=/mnt/nas/unilink BACKUP_OFFSITE_MOUNTPOINT=/mnt/nas BACKUP_AGE_RECIPIENT='age1...' BACKUP_ALERT_COMMAND=/usr/local/bin/notify-unilink-backup-failure bash scripts/backup.sh >> /var/log/unilink-backup.log 2>&1
```

Teste o restore em um projeto Docker Compose isolado, sem tocar nos volumes de produção:

```bash
bash scripts/restore.sh 2026-11-21_204500
```

O argumento é o nome de um snapshot diário em `BACKUP_ROOT/daily`. Para snapshot offsite criptografado, informe o caminho do arquivo `.tar.gz.age` e defina `BACKUP_AGE_IDENTITY` para a chave privada correspondente. O script valida checksums, restaura banco e uploads num ambiente temporário, mostra contagens e remove apenas os volumes temporários ao terminar. Faça restore de teste antes da virada e mensalmente depois.

## 5. Smoke test

Configure uma conta de teste e um chamado descartável dedicado. O teste de upload adiciona uma evidência ao chamado indicado:
O host que executa o teste precisa ter `curl` e Python 3 instalados.

```bash
export SMOKE_USERNAME='usuario-teste'
export SMOKE_PASSWORD='senha-de-teste'
export SMOKE_TEST_CHAMADO_ID='UUID-DO-CHAMADO'
export SMOKE_TEST_PROTOCOLO='PROTOCOLO-DO-CHAMADO'
export SMOKE_UPLOAD_FILE='/caminho/para/foto-teste.jpg'
bash scripts/smoke.sh
```

Por padrão, o script valida `https://unilink.lan/api/health`, login, listagem autenticada, consulta pública do protocolo e upload autenticado. Ele falha com código diferente de zero se qualquer etapa falhar. O cliente precisa confiar na CA interna para a validação HTTPS.

## 6. Operação e segurança

```bash
docker compose ps
docker compose logs --tail=100 api
docker compose restart api
docker compose up -d --build
docker compose down
```

`docker compose down -v` apaga volumes, incluindo banco, fotos e dados da CA; use somente em ensaio descartável e depois de confirmar os backups. Restrinja as portas 80/443 à LAN no firewall do host/rede e não configure encaminhamento de portas para a internet.

As fotos são servidas por `/api/evidencias/<uuid>/arquivo`. A recuperação de senha por e-mail não existe na instalação local; um administrador redefine a senha.

## 7. Diferenças em relação ao sistema cloud

| Antes (Supabase/Railway) | Agora |
|---|---|
| Front acessava Supabase | Front usa `/api` |
| Autenticação Supabase | JWT local; usuários entram novamente após a migração |
| Realtime | Atualização automática a cada 10 segundos e após ações |
| Supabase Storage | Volume local de uploads |
| Recuperação de senha por e-mail | Reset feito pelo administrador |

Desligar Supabase/Railway somente após aceite, conferência do backup e restore comprovado. Preserve o dump final criptografado conforme a política de retenção.


### Atualização de permissões: perfil Solicitante

Em instalações já existentes, aplique uma única vez a migração antes de cadastrar usuários com o papel `solicitante`:

```bash
docker compose exec -T db psql -U unilink -d unilink -f /migrations/002_papel_solicitante.sql
```

Em instalações novas, o schema inicial já inclui esse papel.

O papel `solicitante` acessa somente abertura e acompanhamento dos próprios chamados em aberto. Os papéis `atendente`, `supervisor` e `administrador` podem acessar os ambientes Solicitante e Manutenção; as operações administrativas continuam restritas ao administrador.

## 8. Decisão de arquitetura de grupos de serviço

A estrutura atual do sistema usa um único campo `atribuido_para` por chamado e um único conjunto de serviços hardcoded no frontend (`PINTURA`, `ELETRICA`, `SOLDA`, etc.) para a tela de manutenção. Para manter compatibilidade com a operação existente e reduzir risco, a regra adotada nesta fase é:

- o campo `atribuido_para` continua sendo único por chamado;
- a regra de visibilidade do atendente é aplicada por interseção entre os serviços do chamado e os grupos do atendente;
- os itens concluídos só podem ser marcados quando o grupo do atendente participa do serviço;
- a lista de serviços do frontend permanece hardcoded nas telas de correção/pendência para não quebrar a UX atual; a carga dinâmica de `grupos_servico` é um próximo refinamento.

A migração de grupos não remove esses limites; ela garante acesso por grupos sem alterar a modelagem de atribuição operacional atual.

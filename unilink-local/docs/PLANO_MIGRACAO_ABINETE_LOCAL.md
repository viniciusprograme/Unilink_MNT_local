# Plano de Migração — UNILINK para Abinete Local

**Documento:** plano operacional de saída do Supabase/Railway  
**Versão:** 1.0  
**Data:** 23/10/2026  
**Projeto oficial:** `C:\Users\Vinicius\Downloads\unilink-local\unilink-local`  
**Repositório antigo (histórico):** `C:\Users\Vinicius\Downloads\unilink-supabase\unilink-supabase`  
**Janela de virada:** 21 e 22/11/2026  
**Responsável:** a definir  
**Aprovação:** a definir  

> Este documento não contém chaves, senhas ou tokens. Os segredos devem ficar no `.env` do abinete (permissão `600`) e em um cofre de senhas/backup físico seguro.

---

## Sumário

1. [Resumo executivo](#1-resumo-executivo)
2. [Escopo e decisões](#2-escopo-e-decisões)
3. [Estado atual](#3-estado-atual)
4. [Arquitetura alvo](#4-arquitetura-alvo)
5. [Mudanças de comportamento para os usuários](#5-mudanças-de-comportamento-para-os-usuários)
6. [Correções obrigatórias no unilink-local](#6-correções-obrigatórias-no-unilink-local)
7. [Estratégia de migração](#7-estratégia-de-migração)
8. [Cronograma](#8-cronograma)
9. [Fases detalhadas](#9-fases-detalhadas)
10. [Runbook da virada](#10-runbook-da-virada)
11. [Rollback](#11-rollback)
12. [Pós-virada e desligamento](#12-pós-virada-e-desligamento)
13. [Riscos e mitigações](#13-riscos-e-mitigações)
14. [Critérios de aceite](#14-critérios-de-aceite)
15. [Responsabilidades](#15-responsabilidades)
16. [Pendências e decisões abertas](#16-pendências-e-decisões-abertas)
17. [Apêndices](#17-apêndices)

---

## 1. Resumo executivo

O sistema UNILINK sai de uma arquitetura cloud (Supabase + Railway) para um **abinete local** com Docker, PostgreSQL, API Express e nginx, usando o `unilink-local` como base oficial.

A estratégia recomendada é:

1. **Conter o risco imediato:** rotacionar a chave secreta exposta, tornar o repositório privado e proteger os arquivos `.env` que estão dentro de zips.
2. **Preparar o abinete:** Ubuntu Server 24.04 LTS, Docker, Caddy com CA interna, UPS, IP fixo e backup em disco externo/NAS.
3. **Ensaiar a migração:** exportar do Supabase, importar no Postgres local e baixar as fotos do Storage, conferindo contagens e amostras.
4. **Endurecer e pilotar:** HTTPS para a câmera funcionar, backup/restore testado, front offline (CDNs vendorizados) e piloto com 2–5 usuários.
5. **Virar no fim de semana 21–22/11/2026**, com o sistema antigo congelado e mantido para rollback.
6. **Desligar o Supabase/Railway após 14–90 dias**, mantendo backup final criptografado.

**Resultado esperado:** sistema interno funcionando na rede local, sem dependência de Supabase, Railway, internet ou e-mail para operar.

---

## 2. Escopo e decisões

### 2.1 Incluído no escopo

- Migração do banco (chamados, usuários, perfis, eventos, evidências, histórico e auditoria).
- Migração das fotos do bucket `evidencias-chamados`.
- Instalação do `unilink-local` no abinete.
- HTTPS interno com Caddy e CA própria.
- Backup, restore, monitoramento e runbook.
- Virada, rollback e desligamento do Supabase/Railway.
- Limpeza e arquivamento do repositório antigo.

### 2.2 Fora do escopo inicial

- Reescrita do frontend ou do backend.
- Novas funcionalidades de negócio.
- Recuperação de senha por e-mail.
- Integração com Active Directory/LDAP.
- Paginação e otimizações para grandes volumes.

### 2.3 Decisões confirmadas

| Tema | Decisão |
|---|---|
| Base oficial | `unilink-local` |
| Sistema operacional do abinete | Ubuntu Server 24.04 LTS |
| HTTPS | Caddy com CA interna |
| Backup | Disco externo/NAS + cópia semanal offsite |
| Virada | 21–22/11/2026 |
| Banco | PostgreSQL 17 em container |
| Autenticação | JWT próprio + bcrypt (hashes importados do Supabase) |
| Fotos | Volume local `/app/uploads` |
| Frontend | React 18 + Babel + Tailwind, com bibliotecas vendorizadas |

### 2.4 Premissas

- O hardware do abinete será entregue até 30/10/2026.
- Existe um DNS interno ou será possível criar `unilink.lan`.
- Há pelo menos um administrador ativo no Supabase.
- Os usuários continuarão usando as mesmas senhas.
- A rede local permite acesso dos PCs ao abinete na porta 443.
- A janela de manutenção de 21–22/11 será comunicada com antecedência.

---

## 3. Estado atual

### 3.1 Produção antiga

- Pasta real: `C:\Users\Vinicius\Downloads\unilink-supabase\unilink-supabase`
- Stack: React 18 via CDN, Babel Standalone, Tailwind CDN, Supabase (Postgres + Auth + Storage + Realtime) e API Node/Express no Railway.
- Front: branch `front`, deploy estático no Railway.
- API: branch `backend`, deploy Node no Railway.
- Branches existentes: `main`, `front`, `backend`.
- Remote: `https://github.com/viniciusvoid/unilink-supabase.git`.
- Há alterações não commitadas no branch `front` em:
  - `.nvmrc`
  - `DOCUMENTACAO_PROJETO.md`
  - `api/package.json`
  - `api/server.js`
  - `index.html`
  - `js/App.js`
  - `js/services/chamadosService.js`
  - `render.yaml`
- Há `AGENTS.md` não rastreado dentro do repositório antigo.

**Risco:** o código implantado pode não corresponder ao commit do repositório. Antes de arquivar, salvar um patch das alterações não commitadas.

### 3.2 Projeto novo

- Pasta: `C:\Users\Vinicius\Downloads\unilink-local\unilink-local`
- Stack: Docker Compose com Caddy, `db` (Postgres 17), `api` (Node 24/Express) e `web` (nginx).
- Autenticação própria: JWT HS256 + bcrypt.
- Upload local em volume Docker.
- Frontend servido por assets locais, incluindo bibliotecas, fontes e CSS compilado; sem dependência de CDN em runtime.
- Caddy publica HTTPS interno; nginx, API e PostgreSQL não publicam portas diretamente no host.
- Telas administrativas legadas removidas da navegação; `TelaGerenciarUsuarios` é a tela administrativa funcional.
- Backup com checksums, retenção e cópia offsite configurável; restore de teste em Compose isolado.
- Smoke test cobre health, autenticação, lista, protocolo e upload em chamado de teste.

### 3.3 Estrutura de pastas e git

- `C:\Users\Vinicius\Downloads\unilink-supabase` é uma pasta de downloads/embalagem, não um repositório limpo.
- O `.git` da raiz rastreia apenas `AGENTS.md`; o repositório real está em `unilink-supabase\unilink-supabase`.
- Há quatro zips do sistema na raiz:
  - `unilink-supabase.zip`
  - `unilink-supabase (2).zip`
  - `unilink-supabase (3).zip`
  - `unilink-supabase (4).zip`
- Os quatro zips contêm `api/.env`; o `(4)` contém também `api/.env.bak`; todos contêm `.git`.

### 3.4 Achados de segurança

1. **Chave secreta exposta:** o README do `unilink-local` afirma que a `service_role` do Supabase está em repositório público. Tratar como comprometida.
2. **Export de chat versionado:** `Contexto/configurar-front-e-back-no-railway.json` é um export com 582 mensagens e está no repositório antigo. Pode conter a chave.
3. **Zips com `.env`:** os quatro zips do sistema contêm credenciais. Não compartilhar, não subir para nuvem e não anexar em chats.
4. **Repositório possivelmente público:** verificar no GitHub e tornar privado.
5. **Chaves antigas:** após a virada, revogar/rotacionar todas as chaves do Supabase e do Railway.
6. **`.env` local:** `api/.env` e `api/.env.bak` existem no projeto antigo. Não copiar para o abinete.
7. **Hash de senhas no dump:** `dump/usuarios.csv` conterá hashes bcrypt. Tratar como dado sensível e apagar após a importação.

### 3.5 Inventário a levantar antes da migração

Executar no Supabase (somente leitura):

```sql
select count(*) as chamados from public.chamados_unilink;
select count(*) as eventos from public.chamado_eventos;
select count(*) as evidencias, coalesce(sum(tamanho_bytes), 0) as bytes
  from public.chamado_evidencias;
select count(*) as historico from public.chamado_status_historico;
select count(*) as auditoria from public.admin_auditoria;
select papel, ativo, count(*) from public.perfis_usuario group by 1, 2;
select count(*) from auth.users where encrypted_password is null or encrypted_password = '';
select count(*) from auth.users where email is null or email = '';
select split_part(email, '@', 2) as dominio, count(*) from auth.users group by 1;
select status, count(*) from public.chamados_unilink group by 1;
select distinct tipo_evento from public.chamado_eventos;
```

Verificar também:

- Tamanho total do bucket `evidencias-chamados`.
- Quantidade de arquivos no bucket versus linhas em `chamado_evidencias`.
- Existência de pelo menos um administrador ativo.
- Último chamado criado e último acesso de usuário.
- Se o projeto Supabase está ativo (planos gratuitos podem pausar por inatividade).
- Se há usuários sem senha (convite/OAuth), que precisarão de reset.

---

## 4. Arquitetura alvo

### 4.1 Diagrama

```text
Notebooks / PCs
        │
        │ HTTPS (Caddy, CA interna)
        ▼
┌─────────────────────────────────────────────────────┐
│ Abinete local — Ubuntu Server 24.04 LTS             │
│                                                     │
│  Caddy :80/:443                                     │
│      │                                              │
│      ▼                                              │
│  web (nginx) :80                                    │
│      │  /api                                        │
│      ▼                                              │
│  api (Express) :3001                                │
│      │                                              │
│      ▼                                              │
│  db (PostgreSQL 17) :5432                           │
│                                                     │
│  Volumes: pgdata, uploads, apilogs                  │
│  Backup: /mnt/backup/unilink + cópia offsite        │
│  UPS + rede cabeada + IP fixo                       │
└─────────────────────────────────────────────────────┘
```

### 4.2 Dimensionamento

| Item | Mínimo | Recomendado |
|---|---|---|
| CPU | 2 vCPU | 4–8 vCPU |
| RAM | 8 GB | 16 GB |
| Disco do sistema | 128 GB SSD | 256 GB SSD |
| Disco de dados/backup | 256 GB | 512 GB SSD + disco externo/NAS |
| Rede | 1 GbE | 1 GbE cabeada |
| UPS | 600 VA | 600–1200 VA com USB/NUT |
| Sistema | Ubuntu Server 24.04 LTS | Ubuntu Server 24.04 LTS |

O volume atual é pequeno (aproximadamente 58 chamados segundo o README), mas as fotos crescem. Dimensionar com folga de 4–5x sobre o tamanho atual.

### 4.3 Rede e DNS

- IP fixo ou reserva DHCP no roteador.
- Nome interno: `unilink.lan` (evitar `.local`, reservado para mDNS).
- Criar registro A no DNS interno.
- Baixar o TTL para 300s uma semana antes da virada.
- Se não houver DNS interno:
  - usar `hosts` nos PCs (pouco escalável), ou
  - rodar `dnsmasq`/Pi-hole no abinete.
- Firewall:
  - permitir 22/TCP apenas da rede de administração;
  - permitir 80/443/TCP da rede local;
  - não expor o abinete na internet;
  - não fazer port forwarding;
  - acesso remoto apenas por VPN/Tailscale.
- Atenção: portas publicadas pelo Docker podem ignorar o UFW. Usar `ufw-docker` ou bind explícito em interfaces confiáveis.

### 4.4 HTTPS e Caddy

A câmera do navegador (`getUserMedia`) só funciona em contexto seguro. Portanto:

- Caddy na frente do nginx, com `tls internal`.
- Certificado para `unilink.lan`.
- Distribuir o root CA da Caddy para todos os clientes:
  - Windows: GPO ou `certutil -addstore -f Root unilink-root.crt`;
  - Linux: `/usr/local/share/ca-certificates/` + `update-ca-certificates`;
- Testar em um PC comum e em um celular.
- Guardar o root CA em local seguro; se perdido, todos os clientes deixam de confiar no servidor.

### 4.5 Backup

**Regra 3-2-1:**

- 3 cópias: produção, backup local, cópia offsite.
- 2 mídias diferentes: SSD do abinete + disco externo/NAS.
- 1 cópia fora do abinete: disco levado para outro local ou nuvem criptografada.

Rotina recomendada:

- Backup diário às 02:00:
  - `pg_dump` do banco;
  - tar do volume de uploads;
  - checksums SHA-256;
  - cópia para `/mnt/backup/unilink/daily/`.
- Retenção:
  - 14 diários;
  - 8 semanais;
  - 12 mensais.
- Cópia offsite diária, criptografada com `age`; retenção semanal/mensal também configurada.
- Teste de restore mensal.
- Alerta se o backup falhar ou se o último backup tiver mais de 26h.
- Backup separado do `.env` e do root CA da Caddy (cofre de senhas + envelope lacrado).
- RPO alvo: 24h. RTO alvo: 2–4h.

### 4.6 Monitoramento

- Uptime Kuma (ou similar) monitorando `https://unilink.lan/api/health` a cada 60s.
- Alerta por e-mail/Telegram/ntfy.
- Monitorar:
  - espaço em disco do sistema e do backup;
  - idade do último backup;
  - status do UPS (NUT);
  - containers (`docker compose ps`);
  - erros no log da API.
- Rotação de logs do Docker:
  - `max-size: 10m`
  - `max-file: 5`

### 4.7 Segurança física e do host

- Gabinete/rack trancado, ventilado e longe de poeira/calor.
- UPS com desligamento automático.
- BIOS/UEFI:
  - senha de administrador;
  - boot por USB desabilitado;
  - “power on after AC loss” habilitado.
- SSH:
  - somente chave;
  - `PermitRootLogin no`;
  - `PasswordAuthentication no`;
  - `fail2ban` opcional.
- Atualizações de segurança automáticas no Ubuntu; imagens Docker atualizadas com janela e backup prévio.
- LUKS (criptografia de disco) recomendado se o abinete for fisicamente acessível por terceiros; avaliar o custo de unlock no boot.
- PostgreSQL, API e nginx não publicam portas no host; somente Caddy publica 80/443 para a rede interna.

---

## 5. Mudanças de comportamento para os usuários

| Antes (Supabase/Railway) | Depois (abinete local) |
|---|---|
| Acesso por URL do Railway | Acesso por `https://unilink.lan` |
| Login com sessão Supabase | Login com JWT próprio; todos precisam entrar novamente |
| Recuperação de senha por e-mail | Não há e-mail; o admin reseta a senha |
| Realtime | Atualização automática a cada 10s e após ações |
| Fotos no Supabase Storage | Fotos no volume local, servidas por `/api/evidencias/:id/arquivo` |
| Abertura pública direto no Supabase | Abertura pública via API local |
| Dados na nuvem | Dados no abinete da empresa |
| Front dependia de CDNs | Front com bibliotecas vendorizadas (offline) |

Comunicação importante:

- As senhas continuam as mesmas (hash bcrypt importado).
- Se o login falhar, o admin reseta.
- A câmera só funciona em HTTPS.
- Chamados abertos durante a janela de virada devem ser registrados manualmente.
- O sistema antigo ficará disponível para rollback por 14 dias, mas congelado.

---

## 6. Correções obrigatórias no `unilink-local`

### 6.1 P0 — bloqueantes para a virada

| Item | Arquivo(s) | Ação |
|---|---|---|
| Telas legadas quebradas | `web/js/telas/TelaAdmin.js`, `TelaUsuarioDetalhe.js`, `web/js/App.js`, `web/index.html` | Removidas da navegação; gerenciamento usa `TelaGerenciarUsuarios` |
| CDNs externos | `web/index.html` | Assets locais e CSS compilado; sem dependência externa em runtime |
| React de desenvolvimento | `web/index.html` | Builds de produção locais |
| HTTPS/câmera | `docker-compose.yml`, `Caddyfile` | Caddy com CA interna; web/API/DB sem portas públicas |
| Segredos | `.env.example` | `.env` permanece por criar no servidor com permissão `600` |
| Backup/restore | `scripts/backup.sh`, `scripts/restore.sh` | Checksums, retenção, cópia `age` criptografada e restore isolado |
| Smoke test | `scripts/smoke.sh` | Criado; requer conta e chamado de teste dedicados |

### 6.2 P1 — antes ou logo após a virada

| Item | Arquivo(s) | Ação |
|---|---|---|
| `formatarDataBR` duplicada | `chamadosService.js`, `TelaUsuarioDetalhe.js` | Duplicata removida |
| Lockfile | `api/package.json`, `api/Dockerfile` | `package-lock.json` gerado; imagem usa `npm ci` |
| Rotas legadas | `api/server.js` | Rota `/chamados/:id/encerrar` documentada para compatibilidade; rota legada de papel permanece isolada das telas carregadas |
| `.gitignore` | raiz do novo repo | `.env*`, `dump/`, `backups/`, logs e `node_modules` ignorados |
| README | `README.md` | Atualizado para HTTPS, assets offline, backup, restore e smoke test |
| Scripts Supabase | `scripts/1-exportar-supabase.sh`, `2-importar-local.sh`, `api/scripts/baixar-evidencias.js` | Mover para `scripts/legado/` após a migração |

### 6.3 P2 — evolução

- Paginação e filtros no servidor para `GET /chamados`.
- Migrations versionadas.
- Testes automatizados e CI.
- CSP/SRI e revisão do armazenamento do JWT.
- URLs assinadas/autenticação para evidências.
- Permissões mais granulares por papel.
- Build do front com Vite/esbuild, eliminando Babel no navegador.

### 6.4 Detalhes de implementação

As mudanças de aplicação descritas abaixo foram implementadas no projeto local. A preparação de hardware, criação do `.env`, rotação de credenciais e execução de uma virada real continuam sendo tarefas operacionais separadas.

#### Telas legadas

- As tags de `TelaAdmin.js` e `TelaUsuarioDetalhe.js` foram removidas do HTML.
- As rotas legadas foram removidas; a navegação administrativa usa `gerenciar-usuarios`.
- O botão “Voltar” retorna para `manutencao`.
- O atalho legado `admin` redireciona para `gerenciar-usuarios`.

#### Vendorização

Os assets de `web/vendor/` são gerados por `web/scripts/vendor-assets.js`:

- `react.production.min.js`
- `react-dom.production.min.js`
- `babel.min.js`
- CSS Tailwind compilado em `web/css/tailwind.css` (sem runtime Play CDN)
- `xlsx.full.min.js`
- fontes Inter e JetBrains Mono em `.woff2` + `@font-face`

O `web/index.html` carrega somente arquivos locais. `web/vendor/README.md` registra versões e SHA-256; `cd web && npm ci && npm run build` reproduz os assets. O som de alerta usa Web Audio e não busca mídia externa.

#### Caddy

O serviço `caddy` foi adicionado ao `docker-compose.yml`; web, API e PostgreSQL não publicam portas diretamente no host. Configuração:

```caddyfile
unilink.lan {
    tls internal
    encode gzip
    reverse_proxy web:80
}
```

Definir `CORS_ORIGIN=https://unilink.lan` no `.env` (ou deixar vazio, pois o front e a API ficam na mesma origem).

#### Backup

`scripts/backup.sh`:

- gravar em `/mnt/backup/unilink/daily/`;
- gerar `sha256sum`;
- criar cópia offsite criptografada com `age` (chave pública configurada por variável);
- manter 14 diários, 8 semanais e 12 mensais;
- alertar em caso de falha via comando configurável;
- validar que o dump não está vazio.

`scripts/restore.sh` valida checksums e restaura banco e uploads em um projeto Compose temporário isolado; aceita snapshot local ou arquivo offsite `.tar.gz.age`.

#### Smoke test

`scripts/smoke.sh` recebe credenciais, protocolo, UUID de chamado de teste e imagem por variáveis de ambiente e valida com `curl`:

- `GET /api/health`;
- `POST /api/auth/login` com usuário de teste;
- `GET /api/chamados` com token;
- `GET /api/chamados/protocolo/<protocolo>`;
- upload de uma foto de teste.

O script deve falhar com código diferente de zero se qualquer etapa falhar.

---

## 7. Estratégia de migração

### 7.1 Abordagem escolhida

**Big bang com janela de manutenção**, sem escrita dupla.

Motivos:

- O sistema antigo escreve direto no Supabase; não há mecanismo de sincronização bidirecional.
- O volume é pequeno (dezenas de chamados), então uma virada única é viável.
- O fim de semana reduz o impacto.
- O sistema antigo fica intacto para rollback.

### 7.2 Sequência

1. Ensaio completo com dados reais em ambiente local.
2. Piloto com usuários-chave.
3. Reset do banco local e ensaio geral cronometrado.
4. Congelamento do sistema antigo (parar o front do Railway).
5. Exportação final, importação e download de fotos.
6. Smoke test e go/no-go.
7. Troca de DNS e atalhos.
8. Hypercare e desligamento gradual.

### 7.3 Regra de ouro

Não migrar e não apagar o Supabase no mesmo dia. A virada é reversível; a exclusão não é.

---

## 8. Cronograma

| Fase | Período | Foco | Entregável | Gate |
|---|---|---|---|---|
| 0 | 23–27/10/2026 | Contenção e inventário | Segredos rotacionados, repo privado, dados medidos | Sistema antigo funcionando |
| 1 | 26–30/10/2026 | Abinete | Ubuntu, Docker, rede, UPS, DNS, backup | Reboot e acesso OK |
| 2 | 02–06/11/2026 | Instalação e 1ª migração | Dados reais no local | Contagens conferem |
| 3 | 09–13/11/2026 | Hardening e piloto | HTTPS, backup/restore, piloto | Piloto aprovado |
| 4 | 16–20/11/2026 | Ensaio geral | Runbook e ensaio cronometrado | Go/no-go |
| 5 | 21–22/11/2026 | Virada | Sistema local em produção | 48h estável |
| 6 | 23/11/2026–19/02/2027 | Hypercare e desligamento | Supabase/Railway desligados | 90 dias de retenção |

### Marcos

- **27/10:** contenção concluída.
- **30/10:** abinete pronto.
- **06/11:** primeira migração validada.
- **13/11:** piloto aprovado.
- **20/11:** go/no-go.
- **22/11:** virada concluída.
- **07/12:** pausa do sistema antigo.
- **21/12:** exclusão do Railway.
- **19/02/2027:** exclusão do Supabase.

---

## 9. Fases detalhadas

### Fase 0 — Contenção e inventário (23–27/10)

**Objetivo:** eliminar o risco imediato de vazamento e medir o que será migrado.

- [ ] Rotacionar a chave secreta do Supabase (`service_role`/JWT secret) e desativar a antiga.
- [ ] Atualizar a variável no Railway (API) e, se o `anon key` mudar, o `js/supabaseConfig.js` e o deploy do front.
- [ ] Validar login, abertura de chamado e `/health` no sistema antigo.
- [ ] Tornar o repositório GitHub privado; habilitar 2FA; revisar colaboradores e forks.
- [ ] Remover `Contexto/configurar-front-e-back-no-railway.json` do histórico com `git filter-repo`; force-push coordenado.
- [ ] Mover os zips com `api/.env` para cofre criptografado ou apagar; nunca compartilhar.
- [ ] Salvar patch das alterações não commitadas do branch `front`.
- [ ] Registrar commit/branch implantados no Railway.
- [ ] Inventariar chamados, usuários, evidências, fotos, papéis e auditoria.
- [ ] Verificar usuários sem senha/e-mail e domínios de e-mail.
- [ ] Reativar o projeto Supabase se estiver pausado.
- [ ] Confirmar hardware, DNS, janela e responsáveis.

**Entregável:** relatório de contenção e inventário.

**Gate:** sistema antigo operando com a chave nova; nenhum segredo em artefato público; inventário fechado.

### Fase 1 — Abinete (26–30/10)

**Objetivo:** deixar o servidor local pronto para receber o sistema.

- [ ] Instalar Ubuntu Server 24.04 LTS.
- [ ] Configurar BIOS/UEFI: senha, boot USB desabilitado, power-on after AC loss.
- [ ] Criar usuário `unilink`; chaves SSH; desabilitar login por senha.
- [ ] Instalar Docker Engine + Compose plugin.
- [ ] Configurar `ufw`/`ufw-docker` e tailscale/VPN para acesso remoto.
- [ ] Configurar timezone `America/Fortaleza`, NTP e atualizações de segurança.
- [ ] Montar disco externo/NAS em `/mnt/backup/unilink`.
- [ ] Criar registro DNS `unilink.lan` → IP do abinete; TTL 300s.
- [ ] Instalar e testar UPS/NUT.
- [ ] Definir LUKS ou apenas gabinete físico trancado.
- [ ] Documentar IP, MAC, portas, credenciais de infraestrutura (em cofre).

**Entregável:** abinete documentado e testado.

**Gate:** reboot limpo; Docker ok; SSH só por chave; DNS resolve; data/hora corretas; backup mount ok.

### Fase 2 — Instalação e primeira migração (02–06/11)

**Objetivo:** rodar o sistema local com dados reais e validar a migração.

- [ ] Copiar `unilink-local` para `/opt/unilink`.
- [ ] `git init`, commit inicial, tag `v2.0.0-onprem`.
- [ ] Criar `.env` com `DB_PASSWORD` (hex 32) e `JWT_SECRET` (hex 64); permissão `600`.
- [ ] `docker compose up -d --build`.
- [ ] Criar admin de emergência com senha única e guardar no cofre.
- [ ] Exportar do Supabase com `scripts/1-exportar-supabase.sh`.
- [ ] Importar com `scripts/2-importar-local.sh`.
- [ ] Baixar fotos com `baixar-evidencias.js`.
- [ ] Conferir contagens de todas as tabelas.
- [ ] Conferir quantidade e tamanho das fotos.
- [ ] Testar login com 3 usuários antigos.
- [ ] Testar 10 chamados aleatórios.
- [ ] Corrigir os P0 de código.
- [ ] Medir tempo de exportação, importação e download.
- [ ] Documentar falhas e ajustes.

**Entregável:** ambiente local com dados reais.

**Gate:** contagens 100% iguais; fotos 100%; login antigo funcionando; nenhum erro de console.

### Fase 3 — Hardening e piloto (09–13/11)

**Objetivo:** provar que o sistema é seguro, recuperável e usável.

- [ ] Subir Caddy com `tls internal`.
- [ ] Distribuir o root CA para os PCs pilotos.
- [ ] Testar câmera em notebook/celular via HTTPS.
- [ ] Configurar backup diário + cópia semanal offsite.
- [ ] Configurar alerta de falha de backup.
- [ ] Executar restore de teste em banco separado.
- [ ] Configurar Uptime Kuma/monitoramento.
- [ ] Configurar rotação de logs.
- [ ] Fazer matriz de paridade com o sistema antigo.
- [ ] Rodar piloto com 2–5 usuários por 3–5 dias.
- [ ] Treinar manutenção e admin.
- [ ] Distribuir guia rápido de 1 página.
- [ ] Registrar feedback e corrigir problemas.

**Entregável:** piloto aprovado e runbook inicial.

**Gate:** HTTPS/câmera ok; restore comprovado; piloto aprovado; sem P0.

### Fase 4 — Ensaio geral (16–20/11)

**Objetivo:** ensaiar a virada exatamente como ela será feita.

- [ ] Resetar volumes de banco e uploads; preservar a CA do Caddy.
- [ ] Repetir exportação/importação do zero.
- [ ] Cronometrar todas as etapas.
- [ ] Testar DNS, Caddy, atalhos e cache.
- [ ] Fazer backup completo final do Supabase (schema + dados + fotos).
- [ ] Gerar checksums dos dumps e do arquivo de fotos.
- [ ] Comunicar congelamento e janela.
- [ ] Confirmar responsáveis e plantão.
- [ ] Imprimir runbook e checklist.
- [ ] Fazer go/no-go do ensaio.

**Entregável:** runbook validado e go/no-go assinado.

**Gate:** ensaio dentro da janela; todos os comandos validados; equipe treinada.

### Fase 5 — Virada (21–22/11)

Ver §10.

### Fase 6 — Hypercare e desligamento (23/11–19/02/2027)

- [ ] 23–27/11: acompanhamento diário; logs; feedback; correções.
- [ ] 30/11–04/12: acompanhamento em dias alternados.
- [ ] 07/12: pausar Supabase e Railway após 14 dias estáveis.
- [ ] 21/12: excluir serviços do Railway.
- [ ] 19/02/2027: excluir projeto Supabase; revogar chaves; arquivar repo antigo.
- [ ] Manter backup final criptografado por 1 ano.
- [ ] Atualizar documentação e inventário de ativos.

---

## 10. Runbook da virada

### 10.1 Pré-requisitos (T-7 dias)

- [ ] Piloto aprovado.
- [ ] Backup/restore testado.
- [ ] Caddy/HTTPS/câmera testados.
- [ ] Front vendorizado e funcionando sem internet.
- [ ] DNS com TTL baixo.
- [ ] Comunicação enviada.
- [ ] Plantão definido.
- [ ] Dump final do Supabase agendado.
- [ ] Espaço em disco conferido.
- [ ] UPS testado.

### 10.2 Linha do tempo

| Horário | Ação | Responsável | Critério |
|---|---|---|---|
| 20/11 18:00 | Aviso final e congelamento de novas demandas | Gestor | Equipe ciente |
| 21/11 19:00 | Backup completo do Supabase + fotos | TI/Dev | Checksums ok |
| 21/11 20:00 | Parar o serviço do front no Railway | TI | Ninguém abre chamado novo |
| 21/11 20:15 | Exportação final do banco | Dev | Dump íntegro |
| 21/11 20:30 | Transferir dump/fotos para o abinete | TI | Checksum confere |
| 21/11 20:45 | Resetar banco local e importar | Dev | Contagens conferem |
| 21/11 21:15 | Baixar fotos e conferir amostras | Dev | 100% dos arquivos |
| 21/11 21:45 | Subir stack + Caddy | Dev | Health ok |
| 21/11 22:00 | Smoke test completo | Dev + Admin | Checklist 100% |
| 21/11 22:30 | Go/no-go | Gestor | Sem P0 |
| 21/11 23:00 | Trocar DNS e atalhos | TI | URL nova abre |
| 21/11 23:30 | Monitorar logs e acessos | Dev | Sem erros |
| 22/11 09:00 | Revalidar login, câmera e backup | Dev | Tudo ok |
| 22/11 12:00 | Comunicar conclusão | Gestor | Usuários avisados |

### 10.3 Comandos de referência

Executar no abinete, em `/opt/unilink`:

```bash
# 1. Validar stack
docker compose ps
docker compose logs --tail=100 api
curl https://unilink.lan/api/health

# 2. Resetar apenas banco e uploads; preservar os volumes da CA Caddy
docker compose down
docker volume rm unilink_pgdata unilink_uploads

# 3. Subir o banco e importar
docker compose up -d db
export SUPABASE_DB_URL='postgresql://...'
bash scripts/1-exportar-supabase.sh
bash scripts/2-importar-local.sh

# 4. Baixar fotos (usar a chave nova)
docker compose up -d --build
docker compose run --rm \
  -e SUPABASE_URL='https://<projeto>.supabase.co' \
  -e SUPABASE_SERVICE_ROLE_KEY='<chave-nova>' \
  api node scripts/baixar-evidencias.js

# 5. Conferir contagens
docker compose exec -T db psql -U unilink -d unilink -c "
select 'usuarios' as tabela, count(*) from usuarios
union all select 'perfis', count(*) from perfis_usuario
union all select 'chamados', count(*) from chamados_unilink
union all select 'eventos', count(*) from chamado_eventos
union all select 'evidencias', count(*) from chamado_evidencias
union all select 'historico', count(*) from chamado_status_historico
union all select 'auditoria', count(*) from admin_auditoria;"

# 6. Smoke test
SMOKE_USERNAME='<usuario-teste>' \
SMOKE_PASSWORD='<senha-teste>' \
SMOKE_TEST_CHAMADO_ID='<uuid-chamado-teste>' \
SMOKE_TEST_PROTOCOLO='<protocolo-chamado-teste>' \
SMOKE_UPLOAD_FILE='/caminho/foto-teste.jpg' \
bash scripts/smoke.sh
```

> O nome dos volumes acima corresponde ao project name padrão `unilink` em `/opt/unilink`. Confirme os nomes com `docker volume ls` antes de removê-los. Não remova `unilink_caddy_data` nem `unilink_caddy_config`: isso troca a CA e exige redistribuir o certificado raiz.

### 10.4 Go/no-go

A virada só continua se **todos** os itens abaixo estiverem ok:

- [ ] Contagens de todas as tabelas conferem.
- [ ] 100% das fotos presentes e abrindo.
- [ ] Login com senha antiga funciona para admin, supervisor e atendente.
- [ ] Abertura pública de chamado com fotos funciona.
- [ ] Acompanhamento por protocolo funciona.
- [ ] Assumir e concluir (parcial/total) funciona.
- [ ] Dashboard e exportações funcionam.
- [ ] Admin cria/reseta/suspende/desbloqueia usuário.
- [ ] Câmera funciona via HTTPS.
- [ ] Backup diário existe e restore foi testado.
- [ ] Nenhum erro P0 nos logs.
- [ ] Sistema antigo permanece intacto para rollback.

Se qualquer item falhar, **não trocar o DNS**. Corrigir e reagendar.

---

## 11. Rollback

### 11.1 Antes da troca de DNS

- Reiniciar o front no Railway.
- Descartar o ambiente local.
- Nenhuma perda de dados, pois ninguém escreveu no local.

### 11.2 Depois da troca, antes de segunda-feira

- Parar o stack local.
- Reativar o front no Railway.
- Re registrar manualmente os chamados criados no local.
- Comunicar os usuários.
- Investigar a causa antes de tentar novamente.

### 11.3 Depois de segunda-feira

- Preferir corrigir para frente.
- Rollback perderia dados criados no local.
- Usar backup/restore se necessário.
- Manter o Supabase/Railway por 14 dias para consulta.

### 11.4 Regras

- Não apagar o Supabase no dia da virada.
- Não sobrescrever o backup final.
- Não reutilizar chaves antigas.
- Documentar qualquer rollback e suas causas.

---

## 12. Pós-virada e desligamento

| Data | Ação |
|---|---|
| 23–27/11/2026 | Hypercare diário; logs; disco; backup; feedback |
| 30/11–04/12/2026 | Hypercare em dias alternados |
| 07/12/2026 | Pausar Supabase e Railway (sem apagar) após 14 dias estáveis |
| 21/12/2026 | Excluir serviços do Railway; manter dump final |
| 19/02/2027 | Excluir projeto Supabase; revogar chaves; arquivar repo antigo |
| Após 19/02/2027 | Manter backup final criptografado por 1 ano |

Antes de apagar:

- [ ] Restaurar o backup em ambiente de teste.
- [ ] Conferir contagens e fotos.
- [ ] Registrar o aceite do gestor.
- [ ] Revogar chaves e tokens.
- [ ] Remover segredos do GitHub/Railway.
- [ ] Arquivar o repositório antigo como somente leitura.
- [ ] Atualizar o inventário de ativos e a documentação.

---

## 13. Riscos e mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Chave secreta vazada | Alta | Crítico | Rotacionar agora; repo privado; remover do histórico |
| Perda de dados na virada | Média | Crítico | Freeze; dump final; checksums; backup; conferência |
| Câmera bloqueada em HTTP | Alta | Médio | Caddy + CA interna + teste real |
| Queda de energia | Média | Alto | UPS/NUT; auto-start; `restart: unless-stopped` |
| Disco cheio | Média | Alto | Monitoramento; retenção; archive de fotos |
| Backup nunca testado | Alta | Crítico | Restore mensal obrigatório |
| Falha de rede | Média | Médio | IP fixo; switch; cabo reserva; procedimento manual |
| Usuário esquece senha | Alta | Baixo | Admin reseta; SLA definido |
| Alterações não commitadas perdidas | Média | Médio | Patch/commit antes de arquivar |
| Projeto Supabase pausado | Média | Alto | Reativar antes do ensaio/virada |
| Docker ignora UFW | Média | Alto | `ufw-docker` ou bind explícito |
| Root CA perdido | Baixa | Alto | Backup do root CA em cofre |
| Atualização quebrar o stack | Baixa | Médio | Backup + janela + rollback de imagem |

---

## 14. Critérios de aceite

1. Contagens de usuários, chamados, eventos, evidências, histórico e auditoria 100% iguais.
2. 100% das fotos acessíveis e abrindo no navegador.
3. Login com senha antiga funciona para admin, supervisor e atendente.
4. Abertura pública de chamado com fotos + acompanhamento por protocolo.
5. Assumir, concluir parcial/total, anexar fotos, dashboard, Excel/XML/PDF e impressão de OS.
6. Admin: criar usuário, resetar senha, alterar papel, suspender, desbloquear e auditar.
7. Câmera funcionando via HTTPS em um PC da rede.
8. Reboot do abinete e volta automática do sistema.
9. Backup diário executando e restore de teste comprovado.
10. Sistema estável por 48h após a virada, sem P0/P1.
11. Front funciona sem internet (bibliotecas vendorizadas).
12. PostgreSQL não está exposto na rede.
13. SSH só por chave; firewall ativo; portas mínimas.
14. Documentação e runbook entregues.

---

## 15. Responsabilidades

| Papel | Responsabilidades |
|---|---|
| Gestor/patrocinador | Aprovar datas, comunicar usuários, aprovar go/no-go |
| Desenvolvimento | Corrigir P0/P1, migrar dados, smoke tests, suporte |
| TI/infra | Abinete, Ubuntu, Docker, rede, DNS, UPS, Caddy, backup físico |
| Admin do sistema | Validar login, usuários, reset de senha, piloto |
| Usuários-chave | Testar fluxos reais e dar feedback |
| Plantão da virada | Monitorar logs, atender chamados, decidir rollback |

---

## 16. Pendências e decisões abertas

- [ ] Confirmar modelo do hardware, RAM, SSD e UPS; data de entrega.
- [ ] Confirmar quem gerencia o DNS interno e se `unilink.lan` pode ser criado.
- [ ] Informar o volume real de fotos (`sum(tamanho_bytes)`) e o crescimento estimado.
- [ ] Confirmar se os usuários aceitam a perda da recuperação de senha por e-mail.
- [ ] Definir o responsável de plantão em 21–22/11.
- [ ] Definir o aprovador do go/no-go.
- [ ] Definir a política de retenção de fotos e dados.
- [ ] Confirmar se haverá LUKS no disco do abinete.
- [ ] Confirmar se o abinete terá internet (para atualizações) ou será totalmente isolado.

---

## 17. Apêndices

### A. Queries de inventário

```sql
-- Contagens gerais
select 'chamados' as tabela, count(*) from public.chamados_unilink
union all select 'eventos', count(*) from public.chamado_eventos
union all select 'evidencias', count(*) from public.chamado_evidencias
union all select 'historico', count(*) from public.chamado_status_historico
union all select 'auditoria', count(*) from public.admin_auditoria;

-- Tamanho das fotos
select count(*) as evidencias, coalesce(sum(tamanho_bytes), 0) as bytes
from public.chamado_evidencias;

-- Usuários por papel/status
select papel, ativo, count(*) from public.perfis_usuario group by 1, 2;

-- Usuários problemáticos para importação
select count(*) from auth.users where encrypted_password is null or encrypted_password = '';
select count(*) from auth.users where email is null or email = '';
select split_part(email, '@', 2) as dominio, count(*) from auth.users group by 1;

-- Status e tipos de evento
select status, count(*) from public.chamados_unilink group by 1;
select distinct tipo_evento from public.chamado_eventos;

-- Evidências sem caminho
select count(*) from public.chamado_evidencias where storage_path is null or storage_path = '';
```

### B. Snippets de Caddy e Compose

`docker-compose.yml` (trecho):

```yaml
services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - web

  web:
    image: nginx:1.27-alpine
    restart: unless-stopped
    # sem ports públicos; o Caddy acessa web:80 na rede interna
    volumes:
      - ./web:/usr/share/nginx/html:ro
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - api

volumes:
  caddy_data:
  caddy_config:
```

`Caddyfile`:

```caddyfile
unilink.lan {
    tls internal
    encode gzip
    reverse_proxy web:80
}
```

Exportar o root CA:

```bash
docker compose exec caddy cat /data/caddy/pki/authorities/local/root.crt > unilink-root.crt
```

### C. Backup e restore

Backup manual:

```bash
bash scripts/backup.sh
```

Backup com destino externo:

```bash
BACKUP_OFFSITE_DIR=/mnt/nas/unilink \
BACKUP_OFFSITE_MOUNTPOINT=/mnt/nas \
BACKUP_AGE_RECIPIENT='age1...' \
bash scripts/backup.sh
```

Guarde a chave privada `age` fora do servidor. O backup valida checksums e mantém 14 diários, 8 semanais e 12 mensais.

Restore de teste local:

```bash
bash scripts/restore.sh 2026-11-21_204500
```

Para restaurar um arquivo offsite criptografado:

```bash
BACKUP_AGE_IDENTITY=/caminho-seguro/age-identity.txt \
bash scripts/restore.sh /mnt/nas/unilink/daily/2026-11-21_204500.tar.gz.age
```

Timer systemd (exemplo):

```ini
# /etc/systemd/system/unilink-backup.service
[Unit]
Description=Backup UNILINK

[Service]
Type=oneshot
WorkingDirectory=/opt/unilink
ExecStart=/bin/bash scripts/backup.sh
```

```ini
# /etc/systemd/system/unilink-backup.timer
[Unit]
Description=Backup diario UNILINK

[Timer]
OnCalendar=*-*-* 02:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

Ativar:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now unilink-backup.timer
```

### D. Checklist de smoke test

- [ ] `GET /api/health` retorna `{"ok":true}`.
- [ ] Login de admin funciona.
- [ ] Login de atendente funciona.
- [ ] Lista de chamados carrega.
- [ ] Abrir chamado público com 2 fotos.
- [ ] Consultar protocolo e ver timeline/fotos.
- [ ] Assumir chamado.
- [ ] Concluir parcial com observação e foto.
- [ ] Concluir total.
- [ ] Dashboard carrega.
- [ ] Exportar Excel.
- [ ] Imprimir OS.
- [ ] Admin lista usuários.
- [ ] Admin cria usuário.
- [ ] Admin reseta senha.
- [ ] Admin desbloqueia usuário.
- [ ] Auditoria lista movimentos.
- [ ] Câmera abre via HTTPS.
- [ ] Backup do dia existe.
- [ ] Restore de teste passou.

### E. Modelo de comunicação

```text
Assunto: UNILINK — migração para servidor local em 21–22/11

Equipe,

Nos dias 21 e 22/11 o UNILINK será migrado do Supabase/Railway para um
servidor local da empresa.

O que muda:
- Novo endereço: https://unilink.lan
- Será necessário fazer login novamente.
- As senhas continuam as mesmas.
- Não haverá recuperação de senha por e-mail; o administrador fará o reset.
- A câmera só funciona com HTTPS (o novo endereço já usa HTTPS).

O que não muda:
- Abertura de chamados, protocolo, fotos, histórico e dashboard.
- Os perfis e permissões existentes.

Durante a janela:
- Evitem abrir chamados entre 21/11 20:00 e 22/11 12:00.
- Se precisarem registrar algo urgente, procurem o plantão.

Suporte:
- <nome/contato>
```

### F. Limpeza do repositório antigo

- [ ] Salvar patch das alterações não commitadas.
- [ ] Tornar o repositório privado.
- [ ] Remover o export de chat do histórico.
- [ ] Rotacionar a chave secreta.
- [ ] Remover os zips com `.env` do computador ou colocá-los em cofre criptografado.
- [ ] Arquivar o repositório como somente leitura após a estabilização.
- [ ] Remover `render.yaml`, `vercel.json`, `nixpacks.toml` e `RAILWAY.md` do novo projeto.
- [ ] Manter o dump final criptografado por 1 ano.

### G. Glossário

| Termo | Significado |
|---|---|
| Abinete local | Servidor físico da empresa que hospeda o sistema |
| RPO | Perda máxima aceitável de dados (tempo) |
| RTO | Tempo máximo aceitável para restaurar o serviço |
| CA interna | Autoridade certificadora própria para HTTPS na rede local |
| Vendorizar | Copiar bibliotecas externas para dentro do projeto |
| Smoke test | Teste rápido dos fluxos essenciais |
| Big bang | Virada única, sem operação em paralelo |
| Hypercare | Período de acompanhamento intensivo após a virada |

---

## Controle de versões

| Versão | Data | Alteração |
|---|---|---|
| 1.0 | 23/10/2026 | Criação do plano com decisões de base, OS, HTTPS, backup e data da virada |

---

**Fim do documento.**

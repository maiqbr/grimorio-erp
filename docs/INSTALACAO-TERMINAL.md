# Instalação pelo terminal

Este guia usa PowerShell no Windows. Em macOS e Linux, troque `Copy-Item origem destino` por `cp origem destino`. Tenha [Git](https://git-scm.com/downloads), [Node.js 22 ou mais recente](https://nodejs.org/en/download), npm, uma conta [Cloudflare](https://dash.cloudflare.com/) e um domínio ativo nessa conta. Os valores que você precisará reunir estão na [lista inicial](INSTALACAO.md#antes-de-configurar).

## 1. Baixar e testar no computador

```powershell
git clone https://github.com/maiqbr/grimorio-erp.git
cd grimorio-erp
npm ci
Copy-Item .dev.vars.example .dev.vars
npm run db:local
npm run dev
```

Abra `http://127.0.0.1:5173`. O desenvolvimento local grava dados em `.wrangler/` e não envia e-mails reais. Para encerrar, pressione `Ctrl+C`. Esta etapa é opcional se você quer apenas publicar na Cloudflare.

## 2. Criar banco e arquivos na Cloudflare

```powershell
npx wrangler login
npx wrangler d1 create grimorio
npx wrangler r2 bucket create grimorio-files
Copy-Item wrangler.example.jsonc wrangler.jsonc
```

O primeiro comando abre o navegador para entrar na Cloudflare. Guarde o `database_id` exibido na criação do D1. Se os nomes `grimorio` ou `grimorio-files` já estiverem em uso, escolha outros e anote-os.

## 3. Proteger seu endereço com Access

Na Cloudflare, abra **Zero Trust > Access controls > Applications > Create new application > Self-hosted and private**. Adicione um **public hostname** com o endereço do ERP, cobrindo o site inteiro. Crie uma política **Allow** para o seu e-mail. Escolha um método de entrada, como código enviado por e-mail, e salve.

Copie o **Application Audience (AUD)** da aplicação e o domínio da sua equipe, que termina em `.cloudflareaccess.com`. O Access deve pedir login no endereço do ERP antes de você considerar a instalação concluída. [Instruções oficiais do Access](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/).

## 4. Preencher `wrangler.jsonc`

Abra o arquivo copiado na etapa 2 e troque todos os valores de exemplo:

| Campo | O que colocar |
| --- | --- |
| `name` | Nome do Worker, por exemplo `grimorio-erp` |
| `routes[0].pattern` | Seu subdomínio, por exemplo `erp.exemplo.com` |
| `vars.APP_ORIGIN` | `https://` mais o subdomínio acima, sem barra final |
| `vars.ACCESS_TEAM_DOMAIN` | Domínio da equipe Access, sem `https://` |
| `vars.ACCESS_AUD` | AUD da aplicação Access |
| `vars.OWNER_EMAIL` | O mesmo e-mail autorizado na política Access |
| `d1_databases[0].database_name` | Nome do seu banco D1 |
| `d1_databases[0].database_id` | ID do seu banco D1 |
| `r2_buckets[0].bucket_name` | Nome do seu bucket R2 |

Deixe `MAIL_ENABLED` como `false` até configurar o Resend. `MAIL_DOMAIN` pode continuar como `example.com` enquanto o e-mail estiver desativado. Mantenha `workers_dev` e `preview_urls` como `false`. O Git ignora `wrangler.jsonc`; não o force para um repositório público.

## 5. Criar tabelas e publicar

```powershell
npx wrangler d1 migrations apply grimorio --remote --config wrangler.jsonc
npm run check:secrets
npm test
npm run deploy
```

Se você escolheu outro nome para o banco, substitua `grimorio` no comando de migração. A primeira publicação cria o Worker e liga o domínio configurado. No painel Cloudflare, confirme em **Workers & Pages > seu Worker > Settings > Domains & Routes** que o domínio está ligado e que `workers.dev` e URLs de prévia estão desligados.

Abra seu endereço em uma janela anônima: deve aparecer o login do Access. Entre com o e-mail autorizado e verifique se o ERP carrega. Se a página abrir sem login, revise a aplicação Access antes de usar o ERP. A rota `/api/status` também deve ficar protegida.

## 6. Recursos opcionais

**Cofre de senhas:** gere uma chave e copie o resultado para um gerenciador de senhas antes de cadastrá-la na Cloudflare:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
npx wrangler secret put VAULT_ENCRYPTION_KEY --config wrangler.jsonc
```

Cole a chave quando o Wrangler pedir. Ela deve ter 64 caracteres hexadecimais. Sem a chave original, seus itens do cofre não poderão ser lidos. Se não for usar o cofre, pule esta etapa.

**E-mail:** siga o [guia do Resend](RESEND.md). Depois de verificar o domínio, grave `RESEND_API_KEY` com `npx wrangler secret put RESEND_API_KEY --config wrangler.jsonc`, ajuste `MAIL_DOMAIN` e `MAIL_ENABLED` e publique de novo com `npm run deploy`. Recebimento usa Cloudflare Email Routing, configurado separadamente.

**Calendário ICS:** se tiver uma URL privada de calendário, grave-a com `npx wrangler secret put OUTLOOK_ICS_URL --config wrangler.jsonc`.

## Atualizações

Antes de publicar uma versão nova, faça backup dos dados e execute `npx wrangler d1 migrations apply grimorio --remote --config wrangler.jsonc`, `npm test`, `npm run build` e `npm run check:secrets`. Depois execute `npm run deploy`. Nunca salve chaves, `.dev.vars` ou backups no Git.

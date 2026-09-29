# Instalação em Cloudflare

Este guia usa Node.js 22 ou mais recente, npm e Wrangler autenticado com `npx wrangler login`. Confira os custos e limites do seu plano Cloudflare antes de criar os recursos.

## 1. Preparar os recursos

```powershell
npm ci
npx wrangler d1 create grimorio
npx wrangler r2 bucket create grimorio-files
Copy-Item wrangler.example.jsonc wrangler.jsonc
```

Copie o `database_id` mostrado pelo comando D1 para `wrangler.jsonc`. Ajuste também `name`, `database_name`, `bucket_name` e o hostname se você escolheu nomes diferentes. Não reutilize IDs de outra instalação.

O domínio indicado em `routes.pattern` precisa estar na sua conta Cloudflare. Use a mesma URL em `APP_ORIGIN`, com `https://` e sem barra final. Substitua os valores de exemplo de `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `OWNER_EMAIL` e `MAIL_DOMAIN`. Se não for usar e-mail, deixe `MAIL_ENABLED` como `false`; `MAIL_DOMAIN` ainda define os remetentes dos rascunhos.

## 2. Proteger o domínio com Cloudflare Access

Antes de implantar, crie uma aplicação **Self-hosted** do Cloudflare Access para o hostname exato do ERP, cobrindo todas as rotas. Crie uma política **Allow** apenas para o e-mail indicado em `OWNER_EMAIL`. Copie o domínio da sua organização Access para `ACCESS_TEAM_DOMAIN` e o **Application Audience (AUD)** para `ACCESS_AUD`.

O Worker também verifica a assinatura do JWT, emissor, audiência e e-mail. Não configure `LOCAL_DEVELOPMENT=true` em produção. `workers_dev` e `preview_urls` ficam desativados no exemplo para não criar URLs alternativas. Confira no painel que o hostname exige login antes de prosseguir.

## 3. Inicializar o banco e publicar

```powershell
npx wrangler d1 migrations apply grimorio --remote --config wrangler.jsonc
npx wrangler secret put VAULT_ENCRYPTION_KEY --config wrangler.jsonc
npm run deploy
```

Crie uma chave de 64 caracteres hexadecimais com `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` e cole quando solicitado. Guarde uma cópia segura fora do repositório. Se não quiser usar o cofre, pode pular esse secret; a área de senhas ficará indisponível.

Verifique o acesso no navegador em janela sem sessão e com o e-mail autorizado. Teste também uma rota `/api/status`. Sem um JWT válido, a API deve negar acesso. Nunca coloque `wrangler.jsonc`, `.dev.vars`, chaves ou backups no Git.

## 4. E-mail opcional

Para enviar, verifique seu domínio no Resend, gere uma chave restrita ao envio e execute:

```powershell
npx wrangler secret put RESEND_API_KEY --config wrangler.jsonc
```

Em `wrangler.jsonc`, ajuste `MAIL_DOMAIN` para o domínio verificado e só então mude `MAIL_ENABLED` para `true` e faça `npm run deploy`. O aplicativo usa `contact@SEU_DOMINIO` para enviar e receber, e `no-reply@SEU_DOMINIO` somente para enviar.

Para receber, configure o Cloudflare Email Routing para encaminhar **somente** `contact@SEU_DOMINIO` ao Worker. O handler rejeita outros destinatários. Revise os registros DNS existentes antes de alterar MX, SPF, DKIM ou DMARC. O recebimento e o envio dependem dos serviços externos e não funcionam no modo local.

Para sincronizar um calendário ICS privado, grave a URL como secret `OUTLOOK_ICS_URL`. O Worker ignora a sincronização agendada enquanto esse valor estiver ausente.

## 5. Atualizações

Antes de cada implantação, aplique as migrações remotas e execute `npm test`, `npm run build` e `npm run check:secrets`. Guarde os backups e a chave do cofre separadamente.

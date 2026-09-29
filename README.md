# Grimório

O Grimório reúne tarefas, calendário, projetos, notas, senhas e e-mail em um espaço pessoal. A interface usa React e Vite. A API roda em Cloudflare Workers, com D1 para os registros e R2 para arquivos e backups.

## Licença e finalidade

Você pode ler o código e instalar o aplicativo para uso pessoal. A [licença](LICENSE.md) não permite uso comercial, alteração do código ou redistribuição. Por isso, o projeto não atende à [definição de código aberto da Open Source Initiative](https://opensource.org/osd).

## Recursos

- Tarefas recorrentes, projetos, calendário e notas.
- Cofre de senhas criptografado quando `VAULT_ENCRYPTION_KEY` é configurada.
- Rascunhos de e-mail locais; envio e recebimento opcionais em produção.
- Temas, identidade visual e idioma personalizáveis.
- Exportação e backups no R2.

## Rodar no computador

Você precisa de Node.js 22 ou mais recente e npm. Os comandos abaixo usam PowerShell.

```powershell
git clone https://github.com/maiqbr/grimorio-erp.git
cd grimorio-erp
npm ci
Copy-Item .dev.vars.example .dev.vars
npm run db:local
npm run dev
```

Abra `http://127.0.0.1:5173`. A API local usa a porta `8787`, e os dados ficam em `.wrangler/`. O modo local aceita apenas `localhost` ou `127.0.0.1` e não envia e-mails reais. O domínio `example.com` configurado em `wrangler.local.jsonc` serve para testar rascunhos.

Para usar o cofre, gere uma chave de 32 bytes em hexadecimal e preencha `VAULT_ENCRYPTION_KEY` em `.dev.vars`:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Guarde a chave em local seguro. Sem ela, os itens criptografados não poderão ser lidos. Não envie `.dev.vars` ao Git.

## Publicar sua própria instância

Para publicar uma instância, você precisa de uma conta Cloudflare com Workers, D1 e R2, um domínio próprio e uma aplicação Cloudflare Access que proteja todas as rotas. O e-mail é opcional. Siga o [guia de instalação](docs/INSTALACAO.md).

## Verificações

```powershell
npm run check:secrets
npm test
npm run build
```

`npm run test:integration` requer que a API local esteja rodando e usa dados temporários de teste.

## Configuração

| Variável | Uso |
| --- | --- |
| `APP_ORIGIN` | URL exata do aplicativo, sem barra final |
| `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `OWNER_EMAIL` | Autenticação de produção via Cloudflare Access |
| `MAIL_DOMAIN` | Domínio que forma `contact@` e `no-reply@` |
| `MAIL_ENABLED` | Ativa envio quando também houver chave Resend |
| `RESEND_API_KEY` | Secret para envio via Resend |
| `OUTLOOK_ICS_URL` | Secret opcional para calendário ICS |
| `VAULT_ENCRYPTION_KEY` | Secret opcional de 64 caracteres hexadecimais para o cofre |

Crie `wrangler.jsonc` a partir de `wrangler.example.jsonc` para definir as variáveis comuns. Insira os segredos com `wrangler secret put`. O Git ignora `wrangler.jsonc` para que os dados da sua instância não sejam publicados.

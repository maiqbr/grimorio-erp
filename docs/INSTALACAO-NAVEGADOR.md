# Instalação pelo navegador

Este caminho não exige terminal nem instalação no computador. Você vai usar os painéis do GitHub e da Cloudflare. Separe uma conta em cada serviço e um domínio ativo administrado pela Cloudflare. O Resend só é necessário se quiser **enviar** e-mails. Confira os [valores que você precisará anotar](INSTALACAO.md#antes-de-configurar).

## 1. Criar uma cópia privada no GitHub

1. Entre no [repositório do Grimório](https://github.com/maiqbr/grimorio-erp).
2. Clique em **Use this template > Create a new repository**.
3. Escolha um nome e marque **Private**. Clique em **Create repository from template**.

Você usará esse repositório privado apenas para a sua instalação. Não escolha **Fork** nem torne a cópia pública. [Ajuda do GitHub para criar um repositório a partir de um modelo](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-repository-from-a-template).

## 2. Criar o banco D1 e o bucket R2

No [painel da Cloudflare](https://dash.cloudflare.com/), selecione a conta onde está seu domínio:

1. Abra **Storage & databases > D1 SQL database** e crie um banco chamado `grimorio`. Abra o banco e copie o **Database ID**. Se der outro nome, anote-o.
2. Abra **Storage & databases > R2 > Overview > Create bucket** e crie `grimorio-files`. Se escolher outro nome, anote-o. Pode ser necessário ativar R2 na conta antes de criar o bucket.

Agora crie as tabelas no D1. No banco que acabou de criar, abra a aba **Console**. Faça estas três execuções, **uma por vez e nesta ordem**:

1. Abra [0001_initial.sql](../migrations/0001_initial.sql) no GitHub da sua cópia privada, clique em **Raw**, copie todo o texto, cole no Console D1 e clique em **Execute**.
2. Repita com [0002_integrations.sql](../migrations/0002_integrations.sql).
3. Repita com [0003_vault.sql](../migrations/0003_vault.sql).

Pare se uma execução apresentar erro. Não rode o mesmo arquivo de novo sem verificar o que foi criado. Ao terminar, a aba **Tables** deve mostrar `records`, `mail` e `integrations`. [Ajuda da Cloudflare para D1 no painel](https://developers.cloudflare.com/d1/get-started/).

## 3. Configurar o login Cloudflare Access

No painel Cloudflare, abra **Zero Trust > Access controls > Applications > Create new application > Self-hosted and private**. Se for a primeira vez, conclua a criação da equipe Zero Trust. Adicione um **public hostname**, como `erp.exemplo.com`, sem limitar a um caminho específico. Crie uma política **Allow** que inclua somente o e-mail com que você vai entrar. Escolha um método de autenticação, como código por e-mail, e salve.

Na página dessa aplicação, copie o **Application Audience (AUD)**. Nas configurações do Zero Trust, copie também o domínio da equipe, que termina em `.cloudflareaccess.com`. Guarde ambos para a próxima etapa. [Ajuda da Cloudflare para aplicações Access](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/).

## 4. Criar o arquivo de configuração no GitHub

Na sua cópia **privada** do GitHub:

1. Abra [wrangler.example.jsonc](../wrangler.example.jsonc) no repositório original e copie seu conteúdo.
2. Na raiz do seu repositório privado, clique em **Add file > Create new file**. Dê ao arquivo o nome exato `wrangler.jsonc` e cole o conteúdo.
3. Troque os valores da tabela abaixo. Depois clique em **Commit changes**.

| Procure no arquivo | Preencha com |
| --- | --- |
| `"name": "grimorio-erp"` | Nome que o Worker terá no painel Cloudflare; pode manter `grimorio-erp` |
| `"pattern": "erp.example.com"` | Seu domínio do ERP, por exemplo `erp.exemplo.com` |
| `"APP_ORIGIN": "https://erp.example.com"` | O mesmo domínio com `https://` e sem `/` no final |
| `"ACCESS_AUD": "REPLACE_WITH_CLOUDFLARE_ACCESS_AUD"` | AUD copiado do Access |
| `"ACCESS_TEAM_DOMAIN": "your-team.cloudflareaccess.com"` | Domínio da equipe Access, sem `https://` |
| `"OWNER_EMAIL": "you@example.com"` | O mesmo e-mail da política Allow |
| `"database_name": "grimorio"` | Nome do banco D1 que você criou |
| `"database_id": "REPLACE_WITH_D1_DATABASE_ID"` | ID do banco D1 que você copiou |
| `"bucket_name": "grimorio-files"` | Nome do bucket R2 que você criou |

Deixe `MAIL_ENABLED` em `false` por enquanto. Mantenha `workers_dev` e `preview_urls` como `false`. Não altere `DB`, `FILES`, `ASSETS`, `main`, `assets` nem `migrations_dir`. O arquivo `wrangler.jsonc` contém seus dados de instalação e só deve existir no seu repositório privado. **Nunca cole chaves de API nesse arquivo.**

## 5. Publicar pelo painel Cloudflare

1. Abra **Workers & Pages > Create application > Import a repository > Get started**.
2. Conecte sua conta GitHub e selecione o repositório **privado** criado na etapa 1.
3. Escolha a branch `main`. O nome do Worker precisa ser igual ao campo `name` de `wrangler.jsonc`.
4. Em **Build command**, coloque `npm run build`. Em **Deploy command**, coloque `npx wrangler deploy`. Deixe o diretório raiz como a raiz do repositório.
5. Salve e aguarde o resultado do build. Se falhar, abra o log do build e confira os valores de `wrangler.jsonc`.

O Worker passa a receber novas implantações quando você atualiza o repositório privado. [Ajuda da Cloudflare para a integração com GitHub](https://developers.cloudflare.com/workers/ci-cd/builds/). Se o painel oferecer uma URL `workers.dev` temporária, não a use como endereço do ERP. Confira em **Settings > Domains & Routes** que o domínio personalizado está ativo e que `workers.dev` e URLs de prévia estão desligados.

## 6. Conferir o acesso

Abra `https://SEU_DOMINIO_DO_ERP` em uma janela anônima. Primeiro deve aparecer o login do Access. Entre com o e-mail autorizado. Depois o Grimório deve abrir. Teste também `https://SEU_DOMINIO_DO_ERP/api/status` em uma janela anônima: ela não deve mostrar dados sem login.

Se a página abrir sem pedir login, revise o hostname e a política do Access antes de cadastrar qualquer informação. Se aparecer erro de banco, confira o ID do D1, a ligação `DB` e a execução dos três arquivos SQL. Se os arquivos não carregarem, confira o build e a configuração `assets`.

## 7. Ativar funções opcionais

**Cofre de senhas:** use um gerador confiável do seu gerenciador de senhas para criar **64 caracteres hexadecimais** (`0` a `9`, `a` a `f`). Guarde essa chave. No painel Cloudflare, abra **Workers & Pages > seu Worker > Settings > Variables and Secrets > Add**. Selecione **Secret**, nome `VAULT_ENCRYPTION_KEY`, cole o valor e clique em **Deploy**. Sem a chave original, os itens do cofre não poderão ser lidos.

**E-mail:** siga o [guia do Resend](RESEND.md). A chave `RESEND_API_KEY` entra no mesmo painel como **Secret**. `MAIL_DOMAIN` e `MAIL_ENABLED` são alterados no `wrangler.jsonc` do seu repositório privado. Recebimento é configurado no Cloudflare Email Routing.

**Calendário ICS:** cadastre sua URL privada no mesmo painel como **Secret** chamado `OUTLOOK_ICS_URL`.

Para atualizar o aplicativo no futuro, guarde uma cópia dos dados antes. Se a versão nova trouxer arquivos SQL em `migrations/`, aplique apenas as novas migrações no Console D1, na ordem, antes de atualizar os arquivos no seu repositório privado.

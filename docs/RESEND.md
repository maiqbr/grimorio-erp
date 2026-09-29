# E-mail com Resend

O e-mail é opcional. O Grimório funciona sem Resend. Para **enviar** mensagens, use uma conta [Resend](https://resend.com/) e um domínio que você controla. Para **receber** mensagens, configure também o Cloudflare Email Routing. Não é preciso instalar biblioteca Resend: o Worker já chama a API do serviço.

O Grimório usa dois endereços no domínio definido em `MAIL_DOMAIN`:

| Endereço | Função |
| --- | --- |
| `contact@SEU_DOMINIO` | Enviar e receber |
| `no-reply@SEU_DOMINIO` | Enviar sem esperar resposta |

Exemplo: com `MAIL_DOMAIN` igual a `mail.exemplo.com`, o endereço de entrada será formado por `contact@` seguido de `mail.exemplo.com`. Um subdomínio dedicado ajuda a manter separados os registros do seu e-mail pessoal. Se você já recebe e-mail no domínio escolhido, confira os registros MX existentes antes de habilitar o recebimento pela Cloudflare.

## 1. Verificar o domínio no Resend

1. Entre no [painel Resend](https://resend.com/domains) e abra **Domains > Add Domain**.
2. Digite o domínio que será `MAIL_DOMAIN`, por exemplo `mail.exemplo.com`. Escolha a região de envio e crie o domínio.
3. O Resend mostrará registros DNS para verificar e autenticar o envio. Se oferecer integração direta com a Cloudflare, use-a. Caso contrário, abra **Cloudflare > seu domínio > DNS > Records > Add record** e copie **tipo, nome e valor exatamente como o Resend mostra**.
4. Volte ao Resend e clique em **Verify** ou na opção equivalente. Aguarde o status **Verified** para os registros necessários ao envio. Se algum registro falhar, compare cada campo com o DNS na Cloudflare.

Não substitua registros MX ou SPF já usados por outro serviço sem entender o efeito na entrega de e-mails. Para um subdomínio novo, a configuração costuma ser mais simples. [Como o Resend verifica domínios](https://resend.com/changelog/domain-verification-events).

## 2. Criar uma chave para envio

No [painel de chaves do Resend](https://resend.com/api-keys), clique em **Create API Key**. Dê um nome, como `grimorio-pessoal`, selecione **Sending access** e restrinja a chave ao domínio verificado, se essa opção aparecer. Copie a chave exibida. [Permissões das chaves Resend](https://resend.com/changelog/new-api-key-permissions).

Trate a chave como senha. Não a coloque no GitHub, em `wrangler.jsonc` ou em mensagens públicas.

## 3. Ligar o envio no Grimório

### Pelo navegador

1. Na Cloudflare, abra **Workers & Pages > seu Worker > Settings > Variables and Secrets > Add**.
2. Escolha **Secret**, nome `RESEND_API_KEY`, cole a chave e clique em **Deploy**.
3. No seu repositório **privado** do GitHub, abra `wrangler.jsonc` e clique no ícone de edição.
4. Troque `MAIL_DOMAIN` pelo domínio verificado no Resend e `MAIL_ENABLED` de `false` para `true`. Salve com **Commit changes**.
5. Aguarde a implantação automática na Cloudflare.

### Pelo terminal

Na pasta do projeto, com o `wrangler.jsonc` já preenchido:

```powershell
npx wrangler secret put RESEND_API_KEY --config wrangler.jsonc
```

Cole a chave quando solicitado. Depois ajuste `MAIL_DOMAIN` e `MAIL_ENABLED` em `wrangler.jsonc` e publique:

```powershell
npm run deploy
```

Em ambos os caminhos, abra o Grimório e envie uma mensagem de teste para **um endereço seu**. Verifique a caixa de destino e a página **Emails** do Resend. Se não enviar, confira o status do domínio, a chave, `MAIL_ENABLED` e o domínio exato em `MAIL_DOMAIN`.

## 4. Receber e-mails, se quiser

O Resend acima cuida do **envio**. Para **receber** mensagens no Grimório, use [Cloudflare Email Routing](https://developers.cloudflare.com/email-service/configuration/email-routing-addresses/):

1. Na Cloudflare, abra **Compute > Email Service > Email Routing** para o domínio de `MAIL_DOMAIN` e ative o serviço. Se escolheu um subdomínio, adicione esse [subdomínio nas configurações de Email Routing](https://developers.cloudflare.com/email-service/configuration/subdomains/).
2. Siga as instruções de DNS da Cloudflare para ativar o recebimento nesse domínio ou subdomínio. Verifique possíveis conflitos de MX com outros provedores.
3. Em **Routing Rules**, crie uma regra para o endereço `contact@SEU_DOMINIO`. Selecione **Send to a Worker** e escolha o Worker do Grimório. Não crie uma regra para `no-reply@` nem uma regra geral para todos os endereços.
4. De outra conta de e-mail, envie uma mensagem de teste para `contact@SEU_DOMINIO` e confira a caixa de entrada do Grimório.

O Worker aceita somente mensagens endereçadas a `contact@MAIL_DOMAIN`. A regra de recebimento e a chave do Resend são configurações diferentes: uma não substitui a outra. O modo local do Grimório não envia nem recebe e-mails reais.

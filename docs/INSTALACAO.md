# Instalar o Grimório

Escolha o caminho que combina com você:

| Guia | Para quem | O que usa |
| --- | --- | --- |
| [Pelo navegador](INSTALACAO-NAVEGADOR.md) | Quer clicar e preencher os painéis | GitHub, Cloudflare e, se quiser e-mail, Resend |
| [Pelo terminal](INSTALACAO-TERMINAL.md) | Trabalha com código e comandos | Git, Node.js, npm e Wrangler |

Os dois caminhos criam **uma instância pessoal em sua própria conta Cloudflare**. Você precisa de um domínio administrado pela Cloudflare, Workers, D1, R2 e Cloudflare Zero Trust. Consulte os limites e preços dos serviços antes de começar. O envio de e-mail é opcional; veja o [guia do Resend](RESEND.md).

O código pode ser usado nos termos da [licença de uso pessoal](../LICENSE.md). O repositório que você criar para sua instalação deve ficar **privado**.

## Antes de configurar

Anote estes valores. Use o mesmo valor em todas as etapas de cada guia.

| Nome | Exemplo | Onde obter |
| --- | --- | --- |
| Domínio do ERP | `erp.exemplo.com` | Um subdomínio do seu domínio na Cloudflare |
| Endereço do aplicativo | `https://erp.exemplo.com` | O domínio acima com `https://`, sem `/` no fim |
| Seu e-mail de acesso | `voce@exemplo.com` | Conta que terá acesso ao ERP |
| Banco D1 | `grimorio` | Nome que você escolher na Cloudflare |
| ID do banco D1 | Identificador longo | Página do banco D1 |
| Bucket R2 | `grimorio-files` | Nome que você escolher na Cloudflare |
| Domínio do Access | `sua-equipe.cloudflareaccess.com` | Configurações do Zero Trust |
| AUD do Access | Identificador longo | Página da aplicação Access |

`DB`, `FILES` e `ASSETS` são nomes de conexão usados pelo código e devem permanecer exatamente assim. Seu banco e seu bucket podem ter outros nomes, desde que você use esses nomes na configuração.

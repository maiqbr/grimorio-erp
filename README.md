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

## Instalar

Escolha o guia que combina com você:

| Quero... | Guia |
| --- | --- |
| Fazer tudo pelo navegador, nos painéis do GitHub e da Cloudflare | [Instalação pelo navegador](docs/INSTALACAO-NAVEGADOR.md) |
| Usar Git, Node.js e comandos no terminal | [Instalação pelo terminal](docs/INSTALACAO-TERMINAL.md) |
| Entender os dados necessários antes de começar | [Visão geral da instalação](docs/INSTALACAO.md) |
| Configurar envio e recebimento de e-mails | [Guia do Resend](docs/RESEND.md) |

O e-mail é opcional. Você pode instalar o Grimório sem criar uma conta Resend. Para publicar o aplicativo, precisa de uma conta Cloudflare com Workers, D1, R2, Zero Trust e um domínio próprio administrado pela Cloudflare.

## Verificações

```powershell
npm run check:secrets
npm test
npm run build
```

`npm run test:integration` requer que a API local esteja rodando e usa dados temporários de teste.

As variáveis e os segredos estão explicados nos guias. `wrangler.jsonc` contém os dados da sua instância. Mantenha sua cópia do repositório privada e nunca salve chaves nesse arquivo.

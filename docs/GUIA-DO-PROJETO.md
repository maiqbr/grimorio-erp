# Guia do projeto Grimório

Este é o mapa de manutenção do Grimório. Use a tabela abaixo para chegar ao código certo e atualize este guia na mesma entrega de qualquer alteração versionada. Para o histórico anterior à criação do guia, consulte o Git.

## O que é este projeto

O Grimório é um espaço pessoal para tarefas, calendário, projetos, notas, senhas e e-mail. Cada instalação usa a conta Cloudflare de quem a configurou; o aplicativo não tem contas nem espaços de trabalho separados para vários usuários. O repositório é público para consulta e instalação pessoal, nos termos da [licença restritiva](../LICENSE.md). A licença não permite alteração, redistribuição ou uso comercial. Consulte o [README](../README.md) para a finalidade e os guias de instalação.

## Encontre o ponto de mudança

| Quero mudar... | Comece por | Confira também |
| --- | --- | --- |
| Navegação, painéis, formulários, tarefas ou Kanban | `src/App.tsx` | `src/types.ts`, `src/styles.css`, rotas em `worker/index.ts` |
| Calendário e datas | `src/App.tsx`, `src/FormControls.tsx`, `src/lib.ts` | `worker/ical-time.ts`, `tests/ical-time.test.ts` |
| Senhas e gerador | `src/PasswordsPage.tsx` | `worker/vault.ts`, rotas `/api/vault`, `worker/validation.ts` |
| Dropdown, data, hora, seletor segmentado ou área de texto | `src/FormControls.tsx` | Classes `.picker-*`, `.field-popover`, `.segmented-*` em `src/styles.css` |
| Cores, temas ou imagens padrão | `src/theme.ts`, `src/styles.css`, `public/` | `src/themePalette.ts`, configurações em `src/App.tsx` |
| Textos e idiomas | `src/i18n.ts` | Texto original usado em `src/App.tsx` e `src/PasswordsPage.tsx` |
| API, permissões e persistência | `worker/index.ts` | `worker/validation.ts`, `src/types.ts`, `migrations/` |
| E-mail, anexos ou assinatura | `worker/index.ts`, tela de e-mail em `src/App.tsx` | `docs/RESEND.md`, tabela `mail`, bucket R2 |
| Calendário externo por ICS | `worker/index.ts`, `worker/ical-time.ts` | `integrations`, `tests/ical-time.test.ts` |
| Backup e restauração | `worker/index.ts` | D1, R2, `tests/integration.mjs` |
| Instalação local ou produção | `package.json`, `vite.config.ts`, `wrangler.local.jsonc`, `wrangler.example.jsonc` | [Guias de instalação](INSTALACAO.md) |

## Como as partes se ligam

1. `src/main.tsx` monta `src/App.tsx`; `src/styles.css` define a base visual.
2. `App.tsx` carrega registros, mensagens, status e backups por `src/lib.ts`, que faz chamadas para `/api` e padroniza os erros.
3. O Vite encaminha `/api` para o Worker local na porta 8787. Em produção, `worker/index.ts` atende API e arquivos compilados em `dist/` no mesmo domínio.
4. O Worker valida entradas em `worker/validation.ts`, grava registros e mensagens no D1 e usa o R2 para imagens enviadas, anexos, payloads de envio e backups.
5. O estado de navegação fica em `App.tsx`, com as páginas Hoje, Tarefas, Calendário, Projetos, Notas, Senhas, E-mail e Configurações. `PasswordsPage.tsx` mantém o estado do cofre e do gerador.

## Dados e regras do produto

`src/types.ts` descreve os dados que o frontend usa. `worker/validation.ts` valida o que a API aceita. Alterar um campo exige revisar os dois arquivos, o formulário, a leitura dos dados antigos e os testes pertinentes.

| Dado | Onde fica | Regra importante |
| --- | --- | --- |
| Tarefa, projeto, evento, nota e preferências | `records` no D1, como JSON | `kind` distingue os tipos. Preferências usam o ID fixo `preferences`. |
| Credencial do cofre | `records` com `kind='vault'` | O Worker cifra o conteúdo com AES-GCM em `worker/vault.ts`. `/api/records` não devolve esses itens. |
| E-mail | Tabela `mail` no D1 | Pastas, estado de envio e metadados dos anexos ficam aqui. |
| Estado da sincronização ICS | Tabela `integrations` no D1 | O provedor usado é `outlook_ics`. |
| Anexos, imagens, payloads e backups | Bucket R2 `FILES` | Prefixos principais: `mail/`, `branding/` e `backups/`. |

As tabelas são criadas por `migrations/0001_initial.sql`, `0002_integrations.sql` e `0003_vault.sql`. Crie uma nova migração numerada quando precisar alterar o banco já instalado. Não edite migrações antigas como se ainda não tivessem sido aplicadas.

Em projetos, a última coluna representa conclusão. Não remova ou renomeie uma etapa ainda usada por tarefas. Tarefas pessoais usam `defaultColumns` de `src/types.ts`. A posição dos cartões é salva em `Task.position`; o arraste no Kanban também pode mudar a etapa. Ao concluir uma tarefa com repetição, `/api/tasks/:id/complete` conclui a atual e cria a próxima com identidade estável, evitando duplicação em tentativas repetidas. Datas são strings `AAAA-MM-DD` locais; `src/lib.ts` calcula a próxima ocorrência e `worker/ical-time.ts` trata horários do ICS.

O bloco de nota rápida é um registro `note` com ID `quick-note`. A tela de notas não o mostra na lista comum. A exclusão de projeto é bloqueada enquanto houver tarefas ou notas vinculadas.

## API e integrações

As rotas ficam em `worker/index.ts`. Os grupos principais são `/api/records`, `/api/tasks/:id/complete`, `/api/vault`, `/api/mail`, `/api/branding`, `/api/backups`, `/api/integrations/outlook/sync` e `/api/status`. Acrescente validação no Worker quando criar ou alterar uma operação; não dependa apenas de limites do formulário.

O Worker exige Cloudflare Access em produção e confere assinatura, emissor, audiência e e-mail configurado como proprietário. Requisições de escrita também precisam trazer a origem definida em `APP_ORIGIN`. O bypass local só é aceito em host loopback com `LOCAL_DEVELOPMENT=true` no arquivo local. A configuração de exemplo mantém `workers_dev` e URLs de prévia desativados. Consulte os [guias de instalação](INSTALACAO.md) antes de alterar autenticação ou exposição de arquivos.

O cofre depende de `VAULT_ENCRYPTION_KEY`, uma chave hexadecimal de 32 bytes. Sem ela, a API do cofre responde como indisponível. A chave não deve entrar no frontend, no Git ou na documentação. Um backup inclui os registros cifrados; perder a chave impede a leitura posterior.

O envio usa Resend apenas quando `MAIL_ENABLED=true` e existe `RESEND_API_KEY`. Rascunhos ficam no D1; antes do envio, o Worker guarda o payload no R2 e marca a mensagem como `pending`. Um resultado incerto não é reenviado automaticamente. O recebimento usa o handler `email()` e Cloudflare Email Routing, aceita somente `contact@MAIL_DOMAIN`, armazena anexos no R2 e converte o corpo para texto. Consulte [E-mail com Resend](RESEND.md) antes de alterar remetentes, DNS, assinatura ou tratamento de falhas.

`OUTLOOK_ICS_URL` é opcional. O Worker sincroniza esse calendário em eventos próprios e registra o estado em `integrations`. Os agendamentos da configuração de produção executam sincronização e backup diário. A restauração cria primeiro uma cópia `pre-restore`; por alterar dados existentes, exige revisão cuidadosa do fluxo e teste com dados descartáveis.

## Design e interação

A base usa Inter para leitura e Cinzel para títulos de destaque. O tema original combina superfícies escuras, destaque violeta e detalhes dourados, com referências discretas a fantasia. Há temas claro, noturno e escuro, além de temas criados pelo usuário. `src/theme.ts` define os papéis de cor e `themeStyle()` injeta variáveis CSS; `src/themePalette.ts` remapeia cores antigas. Use variáveis como `--bg`, `--panel`, `--border`, `--muted`, `--accent` e `--theme-*` ao criar componentes. Confirme contraste e legibilidade nos temas claro e escuro antes de fixar uma cor literal.

Reaproveite os padrões existentes:

- `SelectField`, `DateField` e `TimeField` para escolhas em formulários. O menu de `SelectField` só é montado depois de calcular sua posição; mantenha essa proteção para evitar que apareça no fim da tela antes de se alinhar ao campo.
- `SegmentedControl` para prioridade e repetição, com estado selecionado visível.
- Switches para valores booleanos, seguindo o estilo de `input[type="checkbox"]` com `role="switch"`.
- `ResizableTextarea` para texto longo. O controle de redimensionar deve continuar acessível por ponteiro e teclado.
- Painéis, botões e modais já definidos em `src/styles.css`. Evite criar estilos isolados que não acompanhem o tema.

Os ícones de ação vêm de `lucide-react`. Os recursos padrão em `public/` são genéricos; não acrescente imagens, nomes ou contatos pessoais. A tela permite trocar ícone, logo e avatar por instalação; os arquivos enviados ficam no R2. Textos visíveis precisam de tradução em `src/i18n.ts` para português, inglês e espanhol. Use linguagem curta e direta. Não acrescente comentários de código que apenas narrem a alteração, nem travessões em textos novos.

## Desenvolvimento e verificação

Para instalar e publicar, escolha o [guia pelo navegador](INSTALACAO-NAVEGADOR.md) ou o [guia pelo terminal](INSTALACAO-TERMINAL.md). O desenvolvimento local usa:

```powershell
npm ci
npm run db:local
npm run dev
```

O site local fica em `http://127.0.0.1:5173`, a API em `http://127.0.0.1:8787` e os dados locais em `.wrangler/`. Segredos opcionais de desenvolvimento ficam em `.dev.vars`, que é ignorado pelo Git. Não use variáveis `VITE_` para segredos. Cada pessoa deve manter seu `wrangler.jsonc` preenchido fora do repositório público; a referência versionada é `wrangler.example.jsonc`.

```powershell
npm test
npm run build
npm run check:secrets
```

`npm run test:integration` precisa da API local em execução e cria dados temporários de teste. Para mudanças de interface, confira também no navegador os estados aberto, fechado, vazio, com conteúdo longo, em modal e em tela estreita. Para mudanças de API, confira sucesso, validação e falha. Para mudanças no banco, teste a migração em uma instalação local já populada. O verificador de segredos cobre padrões conhecidos; revise manualmente os arquivos antes de publicar, especialmente dados pessoais, domínios e imagens.

## Como manter este guia atualizado

Toda alteração versionada deve atualizar este arquivo na mesma entrega. Faça duas coisas:

1. Ajuste a seção que explica o comportamento, os arquivos, a regra visual, a API ou a configuração modificada. Se for uma função nova, inclua-a também na tabela “Encontre o ponto de mudança”.
2. Acrescente uma linha ao registro abaixo com data, mudança concreta e área afetada. Não registre só “ajustes” ou uma lista de commits.

Revise `README.md`, `LICENSE.md` e os guias de instalação quando o comportamento, os requisitos ou a forma de uso mudar. Nunca publique valores reais de instância, credenciais, cópias de dados, imagens ou contatos pessoais neste repositório.

## Registro de mudanças

| Data | Mudança | Área |
| --- | --- | --- |
| 2026-10-15 | Criado o mapa de manutenção, com arquitetura, dados, interface, integrações e regra de atualização documental. | Documentação e processo |

# NexusList

O HTML do fórum pode continuar carregando `script.js` pelo mesmo endereço. As correções não exigem CSS novo nem parâmetros de versão no HTML.

## Correções

- Uma única base canônica para exibição e edição; consultas antigas não substituem consultas novas.
- Validação de cabeçalhos, identidades, datas, dias de licença e campos calculados por nome/metadados.
- Rascunhos preservados ao trocar cargo, aviso antes de salvar a limpeza de Consultor(a).
- Conferência da base antes de gravar e releitura dos valores após gravar. A interface não confirma sucesso apenas por receber `ok: true`.
- Avisos de licença recarregados após alterações. RL só é enviado quando nickname e linha conferem na consulta atual, e só é confirmado após verificar RL e a limpeza dos campos.
- Edição bloqueada após falhas de atualização ou gravações de resultado incerto.
- Recuperação de login, revalidação sem sobreposição, conferência da identidade/permissões antes de POSTs.
- Confirmação de configurações e acessos adicionais; proteção dos editores durante gravações.
- Publicação com tempo limite e prova de postagem no tópico esperado.

## Publicação no fórum

Quando o HTML está na mesma origem `https://www.policiarcc.com`, a postagem continua direta e a ponte não é usada.

Se o HTML estiver em outro domínio, instalar também `NexusList-Forumeiros-Bridge.js` no gerenciador de JavaScript do fórum e configurar as origens reais em `ALLOWED_ORIGINS`. A versão nova exige a confirmação READY antes de enviar a ação uma única vez. Ela não repete um POST de resultado incerto e deduplica solicitações pelo identificador. Atualizar somente este repositório não instala esse arquivo no gerenciador do fórum.

## Contrato com a API existente

Este repositório contém a interface, não o Apps Script ou o Worker. Foram preservadas as ações existentes (`bootstrap`, `access`, `organizeData`, `saveSettings`, `markLicenseReturnsAsRL` e ações de acessos). Nenhuma gravação real na planilha ou postagem real no fórum foi feita para testar.

O bootstrap precisa fornecer `data.headers`, `data.rows` e `settings.rows`. Cada linha precisa de `row` e `values` (a seleção canônica da API); `source`/`saved` são alternativas somente quando `values` está ausente. Linhas vazias são ignoradas, mas identidades ausentes/repetidas ou estrutura incompatível bloqueiam edição. Acesso adicional precisa retornar arrays `additionalAccess.nicknames` e `additionalAccess.roles` para ser confirmado.

Colunas calculadas usuais são reconhecidas pelo cabeçalho. Para cálculos com nomes diferentes, o servidor deve retornar `data.formulaColumns`, array de nomes de cabeçalhos ou índices **base zero**. A lista original de colunas booleanas (`G`, `GP`, `RL`, `REB`, `PA`) permanece explícita.

A API de retorno de licença precisa devolver `data.rows` com os números efetivamente alterados, limpar `INÍCIO`/`DIAS` e refletir isso no bootstrap. Respostas de APIs antigas que não comprovem essas alterações não geram sucesso na interface.

## Limites que dependem do servidor

A interface detecta mudanças já visíveis antes de enviar e verifica o resultado depois. Isso **não torna atômica** a leitura seguida de gravação. `organizeData` ainda é o contrato existente de substituição da lista; não foi inventada uma ação de atualização parcial sem suporte no servidor.

Para garantir integridade entre dois administradores simultâneos, o Apps Script precisa conferir `expectedRevision` ou `expectedSnapshot` **dentro do mesmo LockService que protege a gravação**, rejeitar versão divergente e incrementar a revisão. Os payloads já enviam esses campos, `originalMembers`/identidades e `idempotencyKey`. O servidor precisa implementar sua validação; ignorar os campos mantém uma janela de concorrência entre a consulta e o POST. Identificadores permanentes gerados no servidor também precisam substituir o uso exclusivo da posição da linha, especialmente em renomeações e automações de segunda-feira.

O Worker/Apps Script precisa autenticar a identidade por prova verificável e autorizar cada ação. Um nickname enviado pelo navegador, uma chave fixa do Worker ou a verificação visual da interface não substituem essa autenticação. Este ajuste não cria uma prova de identidade para um servidor cujo código não está disponível.

Um timeout do navegador não cancela necessariamente uma operação que já chegou ao Apps Script. Antes de repetir, aguarde e confira a planilha. A garantia definitiva contra execução duplicada depende da persistência de `idempotencyKey` e da consulta de seu resultado no servidor.

## Testes

### Nicknames com ponto ou zeros iniciais

Nicknames são tratados como texto e comparados sem remover pontuação: `.999`, `999`, `9.99` e `00999` são identidades distintas, inclusive nos acessos adicionais e na troca de sessão. A interface envia `textColumns: ["NICKNAME"]` em `organizeData`, mas esse metadado só tem efeito no servidor se ele o implementar.

Se a linha já chega da API como `999`, o ponto original não pode ser recuperado com segurança pelo JavaScript. Na planilha, formate NICKNAME como **Texto simples** e digite novamente `.999`. Só mudar a formatação não recupera caracteres perdidos.

Se salvar `.999` e ele voltar como `999` ou `0.999`, a releitura bloqueia a confirmação e informa a divergência. O Apps Script precisa formatar a coluna antes de gravar. O helper em `apps-script/nicknames-como-texto.gs` está pronto para integrar ao handler `organizeData`; adicioná-lo ao Git não altera automaticamente o Web App do Google. Não substitua o handler inteiro por esse helper e mantenha a proteção de revisão/LockService existente.

Node.js 22 ou mais recente:

```sh
npm install
npm run check
npm test
```

Os testes usam DOM simulado, rede e API simuladas. Cobrem também edição integrada, respostas atrasadas, conflitos antes de POST, confirmação após escrita, inclusão/exclusão, RL, permissões, timeouts e deduplicação da ponte. Não comprovam o comportamento do Apps Script, Worker ou HTML real do fórum.

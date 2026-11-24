# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) · versionamento semântico.

## [Não lançado]

### Corrigido

- **Erros nas janelas:** quando a API recusa um salvamento, a mensagem aparece dentro da janela, logo acima dos botões, e é lida por leitor de tela (antes ficava atrás dela, e o botão parecia não fazer nada). Vale para todas as janelas: cadastros, ajustes de estoque, taxas, lançamentos, rateio, despesas, recebimentos, cancelamentos, produção com estoque negativo e backup. Se a janela já tiver sido fechada quando a resposta chegar, a mensagem vai para o aviso flutuante.
- **Cancelar descarta o que foi digitado** também em clientes, produtos, fornecedores, ajustes, taxas, lançamentos, despesas, rateio e recebimentos: reabrir começa do que está salvo, sem o erro anterior.

### Pendente do plano

- Roteiros fim a fim com Playwright (etapa 8, opcional).
- Etapa 9 (estabilização com uso real): registrar aqui os ajustes depois dos primeiros fechamentos de mês.

## [0.2.0] — 2026-11-24

Instalador com janela própria, edição de materiais, troca de unidade e gestão de categorias. Sem migrations: o banco da 0.1.0 é reconhecido como está.

### Alterado

- **Pacote do Windows:** `iniciar.bat`, `parar.bat` e `instalar-servico.ps1` saem da raiz e ficam em `suporte/` (modo suporte, com console). A opção `--instalador` virou padrão; use `--sem-instalador` para gerar só a pasta portátil.
- **Modo 100% local, sem login:** o app abre direto no Painel em `http://127.0.0.1:1971` (porta padrão, antes 4317). A API age como a primeira administradora ativa (criada como "Ateliê" se não houver nenhuma); saíram a tela de entrada, o botão "Sair" e a aba "Usuárias". Novo filtro do cabeçalho `Host` (só `127.0.0.1`, `localhost`, `[::1]`) contra DNS rebinding.

### Adicionado

- **Instalador com janela própria** como entregável padrão de `npm run dist:win` (e artefato do CI): instala por usuário, sem administrador, com ícone na Área de Trabalho e no menu Iniciar. Sem assinatura de código; o manual ensina a passar pelo SmartScreen. Ver ADR 0007.
- **Encerramento limpo:** fechar a janela encerra a API por IPC (fallback após 8 s), esperando backup ou restauração em andamento. Se a janela cair, a API encerra sozinha.
- **Confirmação ao fechar** a janela só quando há formulário com alterações não salvas.
- Aviso quando outra versão do programa já está aberta, em vez de usar a API antiga sem dizer nada.
- **Troca de unidade em material já usado:** assistente com prévia do estoque, do custo e das receitas, e gravação só depois de confirmar. Converte movimentos, compras, produções e receitas numa transação, com backup automático antes e os números originais na auditoria. Receitas que mudariam mais de 1% são decididas uma a uma. Nenhum valor em reais já lançado muda. Ver ADR 0008.
- **Categorias:** criar, renomear e remover categorias de produtos e de materiais em _Configurações → Categorias_, e "+ Nova categoria" dentro dos cadastros. Categoria em uso só sai movendo os itens para outra, numa transação. Criar, renomear, mover e remover ficam na auditoria; nomes repetidos são recusados sem distinguir maiúsculas nem acentos.

### Corrigido

- **Edição de materiais:** botão "Editar" em cada linha da lista; a mensagem de erro da API aparece dentro da janela (antes ficava atrás dela, e "Salvar" parecia não fazer nada); cancelar descarta o que foi digitado.
- **Unidade do material:** a API recusa trocar a unidade também quando o material é usado em receitas (antes, 250 ml viravam 250 un em silêncio). A tela só trava a unidade quando a API travaria.
- **Janelas:** ao abrir, o foco vai para o primeiro campo (antes ia para o "X"); Esc fecha só a janela de cima.
- Tabelas: Enter em um botão da linha não abre mais o detalhe da linha.

## [0.1.0] — primeira construção do repositório

Implementa as etapas 0 a 8 do plano em uma só entrega.

### Adicionado

- **Fundação (etapa 0):** monorepo npm workspaces (`shared`, `core`, `api`, `web`, `desktop`), TypeScript, ESLint, Prettier, Vitest, CI, conexão SQLite com PRAGMAs, runner de migrations com checksum e cópia automática antes de migrar, `GET /saude`, ADRs 0001–0006.
- **Dados (etapa 1):** migration com todas as tabelas, índices e dados-base; `db:seed` com 3 meses de operação fictícia; `db:check` com as dez invariantes.
- **Cadastros (etapa 2):** login com sessão em cookie `httpOnly` (argon2), primeiro acesso, clientes e fornecedores com busca sem acento, ficha do cliente com abas, guia de estilo.
- **Materiais e compras (etapa 3):** conversão de unidades, rateio de despesas, custo médio móvel, ajuste com justificativa, gráfico de custo, cancelamento com estorno; compra não afeta o resultado.
- **Fichas e preços (etapa 4):** ficha versionada, mão de obra por hora ou fixa, custos extras, despesas compartilhadas sem duplicar desembolso, taxas, três modalidades de preço com cálculo em tempo real, alerta de prejuízo.
- **Produção (etapa 5):** simulação, baixa de material, custo gerencial × custo de estoque, bloqueio de estoque negativo com autorização, cancelamento.
- **Vendas (etapa 6):** vendas com vários itens, recebimentos parciais sem duplicar receita, CMV congelado, cancelamento, catálogo com foto (WebP ≤ 1024 px).
- **Financeiro (etapa 7):** extrato, lançamentos manuais e previstos, os sete blocos de resultado/caixa, painel em uma requisição, gráficos, relatórios com CSV para Excel (UTF-8 com BOM, `;`) e impressão.
- **Entrega (etapa 8):** backup `.zip` com manifesto e sha256, restauração com cópia prévia e validação, backup automático diário com retenção, pacote portátil para Windows, casca Electron, manual e documentação de operação.

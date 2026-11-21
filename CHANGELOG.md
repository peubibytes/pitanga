# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) · versionamento semântico.

## [Não lançado]

### Alterado

- **Modo 100% local, sem login:** o app abre direto no Painel em `http://127.0.0.1:1971` (porta padrão, antes 4317). A API age como a primeira administradora ativa (criada como "Ateliê" se não houver nenhuma); saíram a tela de entrada, o botão "Sair" e a aba "Usuárias". Novo filtro do cabeçalho `Host` (só `127.0.0.1`, `localhost`, `[::1]`) contra DNS rebinding.

### Pendente do plano

- Roteiros fim a fim com Playwright (etapa 8, opcional) e geração do instalador `.exe` assinado.
- Etapa 9 (estabilização com uso real): registrar aqui os ajustes depois dos primeiros fechamentos de mês.

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

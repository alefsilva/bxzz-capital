# BXZZ-Capital Dashboard

Projeto arquitetado para alta performance e escalabilidade, simulando um ambiente de gestão de ativos financeiros.

## Destaques da Implementação

- **State Management:** Fluxo unidirecional com NgRx para garantir previsibilidade em dados de mercado voláteis.
- **Metodologia BEM:** CSS escalável e modular, ideal para integração com Design Systems corporativos.
- **AI-Assisted Development:** Desenvolvido utilizando Claude Code como ferramenta de pair programming, demonstrando eficiência e foco em padrões arquiteturais modernos.

---

## Stack Técnica

| Camada          | Tecnologia                         |
|-----------------|------------------------------------|
| Framework       | Angular 21 (Standalone + Zoneless) |
| State           | NgRx Store + Effects               |
| Estilo          | SCSS + BEM                         |
| Reatividade     | Angular Signals + toSignal()       |
| Testes          | Jest + jest-preset-angular         |
| API             | CoinGecko (Free Tier)              |
| Deploy          | GitHub Pages                       |

---

## Arquitetura FDA (Feature-Driven Architecture)

```
src/app/
├── core/                     # Serviços singleton, interfaces e contratos de API
│   ├── interfaces/
│   │   └── coin.interface.ts
│   └── services/
│       └── coin-gecko.service.ts
│
├── shared/                   # Componentes reutilizáveis (Dumb Components)
│   └── components/
│       └── skeleton/
│
├── store/                    # Estado global NgRx
│   ├── app.state.ts
│   └── watchlist/
│       ├── watchlist.actions.ts
│       ├── watchlist.effects.ts
│       ├── watchlist.reducer.ts
│       ├── watchlist.selectors.ts
│       └── watchlist.state.ts
│
└── features/                 # Features independentes por domínio de negócio
    └── dashboard/
        ├── components/
        │   ├── asset-card/
        │   └── portfolio-summary/
        ├── dashboard.component.*
        └── dashboard.routes.ts
```

A FDA organiza o código pelo **domínio de negócio** (dashboard, watchlist) em vez de pelo tipo de arquivo (components, services, pipes). Isso garante que tudo relacionado a uma feature esteja co-localizado, facilitando manutenção e escalabilidade em equipes grandes.

---

## BEM e Escopo CSS em Projetos de Larga Escala

### O Problema

Em projetos corporativos com múltiplas equipes, o CSS global sofre com **colisão de nomes**, onde `.card`, `.btn` ou `.title` podem ser definidos por diferentes squads e sobrescrever uns aos outros silenciosamente.

### A Solução com BEM

O BEM (Block, Element, Modifier) resolve isso através de **nomes longos e únicos por convenção**:

```scss
// ❌ Risco em projetos grandes — colisão de escopo
.card { ... }
.card .price { ... }
.card .price.up { ... }

// ✅ BEM — sem risco de colisão, sem CSS Modules necessário
.bxzz-capital-asset-card { ... }
.bxzz-capital-asset-card__price { ... }
.bxzz-capital-asset-card__price--up { ... }
```

O prefixo `bxzz-capital-` funciona como um **namespace de produto**. Mesmo sem Shadow DOM ou CSS Modules, dois componentes de equipes diferentes jamais colidirão enquanto usarem prefixos distintos.

### Por que isso importa em bancos

Sistemas financeiros geralmente possuem múltiplos micro-frontends, times distribuídos e um Design System corporativo central. O BEM permite que o DS defina estilos base (`.ds-button`, `.ds-card`) e cada produto os estenda sem risco (`bxzz-capital-button--primary`), mantendo o CSS previsível e auditável.

---

## NgRx: Por que a rentabilidade fica no Selector

```typescript
export const selectPortfolioSummary = createSelector(
  selectAssetProfitabilities,
  selectAssetCount,
  (profitabilities, assetCount): PortfolioSummary => {
    // Cálculo aqui, não no componente
  }
);
```

**Memoization:** `createSelector` memoriza o resultado. Enquanto os inputs não mudarem de referência (garantido pelo reducer imutável), o cálculo **não é reexecutado**. O componente com `ChangeDetectionStrategy.OnPush` recebe sempre o valor em cache.

**Testabilidade:** A lógica de negócio fica isolada e testável sem renderizar nenhum componente.

---

## Princípios SOLID aplicados

| Princípio | Onde | Como |
|-----------|------|------|
| **S** — Single Responsibility | Componentes, Selectors, Services | Cada classe tem uma única razão para mudar: `AssetCardComponent` só renderiza, `CoinGeckoService` só faz HTTP, cada Selector só deriva um dado |
| **O** — Open/Closed | Reducer + Actions | Estendível via novas actions sem alterar o código do reducer existente — basta adicionar um novo `on()` |
| **L** — Liskov Substitution | `WatchlistAsset extends CoinMarket` | `WatchlistAsset` adiciona campos de portfólio mas **nunca quebra o contrato** de `CoinMarket`. O reducer pode tratar um `WatchlistAsset` onde espera um `CoinMarket` sem nenhuma verificação adicional, pois a substituição é segura |
| **I** — Interface Segregation | `coin.interface.ts` | Interfaces específicas por responsabilidade: `CoinMarket` (dados de mercado), `WatchlistAsset` (portfólio), `PortfolioSummary` (agregação), `ApiError` (erros) — nenhum consumidor carrega campos desnecessários |
| **D** — Dependency Inversion | Services, Smart Components | `DashboardComponent` depende do `Store` (abstração), não de HTTP direto. `CoinGeckoService` depende de `HttpClient` (abstração), não de `fetch` ou `XMLHttpRequest` |

---

## Comandos

```bash
# Desenvolvimento
npm start

# Testes unitários (Jest)
npm test

# Testes com watch
npm run test:watch

# Cobertura de código
npm run test:coverage

# Build de produção
npm run build:prod

# Deploy para GitHub Pages
npm run deploy
```

---

## Deploy — GitHub Pages

O script `deploy` realiza o build com `--base-href=/bxzz-capital/` para que o Angular Router funcione corretamente no subpath do GitHub Pages:

```bash
npm run deploy
```

> Requer o repositório configurado com GitHub Pages apontando para a branch `gh-pages`.

---

## Resiliência e Estratégia de Cache

A aplicação implementa uma estratégia **Cache-First com TTL** no LocalStorage para mitigar os limites da [API pública do CoinGecko](https://support.coingecko.com/hc/en-us/articles/4538771776153-What-is-the-rate-limit-for-CoinGecko-API-public-plan) (5–15 requisições por minuto no plano gratuito).

### Como funciona

```
loadPrices action
       │
       ▼
Cache válido? ──── SIM ──▶ loadPricesSuccess (sem HTTP)
       │
      NÃO
       │
       ▼
  Chama API ──── Sucesso ──▶ Salva no LocalStorage ──▶ loadPricesSuccess
       │
    Erro 429
       │
       ▼
Cache expirado? ── SIM ──▶ loadPricesSuccess (dados antigos, UI não fica vazia)
       │
      NÃO
       ▼
  loadPricesFailure
```

| Cenário | Comportamento |
|---------|--------------|
| Cache < 60s | Serve dados do LocalStorage, sem chamada HTTP |
| Cache expirado | Chama a API e atualiza o cache com o novo timestamp |
| Erro 429 + cache disponível | Serve o cache expirado para manter a UI populada |
| Erro 429 + sem cache | Exibe mensagem de erro ao usuário |

### Benefícios

- **Rate Limit Protection:** evita 429 em refreshes manuais rápidos
- **Redução de latência:** o F5 durante os primeiros 60s carrega instantaneamente do LocalStorage
- **Resiliência:** a UI nunca fica vazia enquanto houver algum dado em cache
- **TTL unificado:** o intervalo de auto-refresh (60s) e o TTL do cache compartilham a mesma constante `CACHE_TTL_MS` — impossível dessincronizar

---

## API

Este projeto consome a [CoinGecko API](https://www.coingecko.com/en/api) (plano gratuito — sem autenticação necessária para os endpoints utilizados).

O endpoint principal é `GET /coins/markets` com atualização automática a cada 60 segundos via NgRx Effects.

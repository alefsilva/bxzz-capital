# B-Capital Dashboard

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
.b-capital-asset-card { ... }
.b-capital-asset-card__price { ... }
.b-capital-asset-card__price--up { ... }
```

O prefixo `b-capital-` funciona como um **namespace de produto**. Mesmo sem Shadow DOM ou CSS Modules, dois componentes de equipes diferentes jamais colidirão enquanto usarem prefixos distintos.

### Por que isso importa em bancos

Sistemas financeiros geralmente possuem múltiplos micro-frontends, times distribuídos e um Design System corporativo central. O BEM permite que o DS defina estilos base (`.ds-button`, `.ds-card`) e cada produto os estenda sem risco (`b-capital-button--primary`), mantendo o CSS previsível e auditável.

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

O script `deploy` realiza o build com `--base-href=/b-capital/` para que o Angular Router funcione corretamente no subpath do GitHub Pages:

```bash
npm run deploy
```

> Requer o repositório configurado com GitHub Pages apontando para a branch `gh-pages`.

---

## API

Este projeto consome a [CoinGecko API](https://www.coingecko.com/en/api) (plano gratuito — sem autenticação necessária para os endpoints utilizados).

O endpoint principal é `GET /coins/markets` com atualização automática a cada 60 segundos via NgRx Effects.

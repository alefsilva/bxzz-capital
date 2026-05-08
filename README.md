# BXZZ-Capital Dashboard

Projeto arquitetado para alta performance e escalabilidade, simulando um ambiente de gestão de ativos financeiros.

🔗 **URL de Produção:** https://alefsilva.github.io/bxzz-capital/

## Destaques da Implementação

- **State Management:** Fluxo unidirecional com NgRx para garantir previsibilidade em dados de mercado voláteis.
- **Multi-tab Leader Election:** Apenas uma aba dispara chamadas à API; as demais sincronizam via **BroadcastChannel API**.
- **Resiliência 429:** Cooldown automático de 5 minutos com retry infinito até a API se recuperar.
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
| Sincronização   | BroadcastChannel API               |
| Testes          | Jest + jest-preset-angular         |
| API             | CoinGecko (Free Tier)              |
| Deploy          | GitHub Pages (SSG)                 |

---

## Arquitetura FDA (Feature-Driven Architecture)

```
src/app/
├── core/
│   ├── constants/
│   │   └── refresh.constants.ts        # CACHE_TTL_MS, COOLDOWN_MS
│   ├── interfaces/
│   │   └── coin.interface.ts
│   └── services/
│       ├── coin-gecko.service.ts
│       └── tab-sync.service.ts         # Leader Election + BroadcastChannel
│
├── shared/
│   └── components/
│       └── skeleton/
│
├── store/
│   ├── app.state.ts
│   └── watchlist/
│       ├── watchlist.actions.ts        # enterCooldown, clearCooldown
│       ├── watchlist.effects.ts        # 6 effects orquestrados
│       ├── watchlist.reducer.ts
│       ├── watchlist.selectors.ts      # selectCooldownUntil, selectIsCooldown
│       └── watchlist.state.ts          # cooldownUntil: number | null
│
└── features/
    └── dashboard/
        ├── components/
        │   ├── asset-card/
        │   ├── portfolio-summary/
        │   └── refresh-countdown/      # Countdown SVG MM:SS sincronizado
        ├── dashboard.component.*
        └── dashboard.routes.ts
```

---

## BroadcastChannel API — Decisão Técnica Central

### O Problema

A [API pública do CoinGecko](https://support.coingecko.com/hc/en-us/articles/4538771776153-What-is-the-rate-limit-for-CoinGecko-API-public-plan) limita o plano gratuito a 5–15 requisições por minuto. Em um app financeiro, o usuário frequentemente mantém **múltiplas abas abertas** — e cada aba, sem coordenação, dispararia sua própria requisição ao expirar o cache, multiplicando o consumo da cota e aumentando dramaticamente o risco de erro 429.

### Por que BroadcastChannel API?

A escolha da **BroadcastChannel API** (nativa do browser, sem dependências externas) foi deliberada e preterida frente a outras alternativas:

| Abordagem | Por que foi descartada |
|-----------|----------------------|
| `localStorage` + evento `"storage"` | Só dispara em **outras** abas (não na própria), mas é síncrono na escrita — não garante entrega ordenada de mensagens estruturadas |
| `SharedWorker` | Requer arquivo separado servido pelo mesmo origin, infraestrutura adicional, e suporte a Service Worker pode ser desativado em ambientes corporativos |
| Polling via `localStorage` | Cria timers em todas as abas que fazem leituras repetidas — exatamente o desperdício que queremos evitar |
| WebSocket / SSE | Requer infraestrutura server-side; contradiz a proposta de deploy estático (GitHub Pages / SSG) |

**BroadcastChannel API oferece:**
- **Entrega em tempo real** para todas as abas do mesmo origin (sem polling)
- **Não entrega na própria aba** (sem eco — o remetente não precisa filtrar a própria mensagem)
- **API idiomática**: `postMessage` + listener de `"message"` — familiar e com tipagem limpa no TypeScript
- **Zero infraestrutura server-side**: funciona inteiramente no browser, compatível com SSG/GitHub Pages
- **Suporte amplo**: disponível em todos os browsers modernos

### Como funciona na prática

```
  Aba 1 (Líder)         Aba 2 (Follower)         Aba 3 (Follower)
  ─────────────         ────────────────         ────────────────
  Chama CoinGecko API
  Salva no localStorage
  ─── BroadcastChannel.postMessage("prices-updated") ──▶
                        Recebe mensagem              Recebe mensagem
                        Dispatch loadPricesSuccess   Dispatch loadPricesSuccess
                        (sem HTTP)                   (sem HTTP)
```

Uma única requisição HTTP alimenta **todas** as abas abertas. As Followers nunca tocam na API — apenas recebem a mensagem via BroadcastChannel e atualizam o estado NgRx local.

### Tipos de mensagem

```typescript
type TabMessage =
  | { type: 'heartbeat';            tabId: string }
  | { type: 'prices-updated';       coins: CoinMarket[]; lastUpdated: number }
  | { type: 'cooldown-started';     cooldownUntil: number }
  | { type: 'leader-stepping-down'; tabId: string };
```

---

## Arquitetura Multi-Tab — Leader Election

### Leader Election via localStorage

Cada aba gera um `tabId = crypto.randomUUID()` único em memória. A liderança é disputada e mantida via duas chaves no localStorage:

| Chave localStorage | Conteúdo |
|--------------------|----------|
| `bxzz-leader-id`  | `tabId` da aba líder atual |
| `bxzz-leader-ts`  | Timestamp do último heartbeat (atualizado a cada 10s) |

**Regras de eleição:**
1. Ao iniciar, a aba verifica se há líder com heartbeat recente (< 15s)
2. Se não houver → reclama a liderança imediatamente
3. Se houver colisão (duas abas tentam ao mesmo tempo) → a aba com **menor `tabId` UUID** vence (resolução determinística)
4. Ao detectar heartbeat de outra aba com `tabId < this.tabId` → cede a liderança voluntariamente

### Takeover quando o Líder fecha

Quando o Líder fecha a aba, o evento `beforeunload` é capturado:
1. Broadcasts `{ type: 'leader-stepping-down', tabId }` para todas as Followers
2. Remove `bxzz-leader-id` e `bxzz-leader-ts` do localStorage
3. Cada Follower aguarda um **delay aleatório de 500–1500ms** antes de tentar assumir a liderança

O delay aleatório previne o **thundering herd** — sem ele, todas as Followers tentariam reivindicar a liderança simultaneamente, criando condição de corrida no localStorage.

### Fluxo dos 6 NgRx Effects

```
loadPrices$      — Cache-first: localStorage → API (somente líder)
autoRefresh$     — Agenda próximo refresh ao expirar o TTL (somente líder)
broadcastSync$   — Follower recebe prices-updated/cooldown-started via BroadcastChannel
broadcastPrices$ — Líder transmite loadPricesSuccess para as Followers (dispatch: false)
cooldownExpired$ — Timer de 5 min → retry automático → loop infinito até API responder
onBecomeLeader$  — Nova aba líder retoma o ciclo de refresh a partir do estado atual do cache
```

---

## Resiliência — Cooldown 429

### Estratégia sem retry imediato

Ao receber HTTP 429, o efeito **não faz retry imediato**. Em vez disso:

1. Calcula `cooldownUntil = Date.now() + 300_000` (5 minutos)
2. Persiste no localStorage (`bxzz_cooldown_until`) para sobreviver a recarregamentos
3. Broadcast para todas as abas via BroadcastChannel (`cooldown-started`)
4. Despacha `enterCooldown` para o NgRx Store
5. Se houver cache stale → também despacha `loadPricesSuccess` com os dados antigos (UI nunca fica vazia)

```
Erro 429 recebido
       │
       ▼
cooldownUntil = now + 5min
localStorage.setItem(COOLDOWN_KEY, cooldownUntil)
BroadcastChannel.postMessage({ type: 'cooldown-started', cooldownUntil })
       │
       ├─── Cache stale disponível? ─── SIM ──▶ enterCooldown + loadPricesSuccess(stale)
       │
       └─── Sem cache ──────────────────────▶ enterCooldown + loadPricesFailure
```

### Retry automático infinito

O effect `cooldownExpired$` cria um loop de retry auto-sustentado via `switchMap`:

```typescript
// Cada enterCooldown cancela o timer anterior e agenda um novo
actions$.ofType(enterCooldown)
  .switchMap(({ cooldownUntil }) => timer(Math.max(0, cooldownUntil - Date.now())))
  .filter(() => this.tabSync.isLeader)
  .map(() => loadPrices())
// Se loadPrices$ receber 429 novamente → dispara enterCooldown → novo timer → loop
```

A API se recupera sozinha — nenhuma intervenção manual é necessária.

### Banner de Cooldown na UI

```html
@if (isCooldown()) {
  <div class="bc-dashboard__cooldown" role="status">
    ⚠ Limite de taxa da API atingido. Mantendo dados atuais para sua segurança.
    Próxima tentativa automática em {{ cooldownDisplay() }}...
  </div>
}
```

O countdown MM:SS é calculado via Angular Signal reativo, atualizando a cada segundo.

---

## Cache-First com TTL de 5 Minutos

```
loadPrices action
       │
       ├─ SSG build? ──── SIM ──▶ EMPTY (no-op)
       │
       ├─ Cooldown ativo? ─ SIM ──▶ enterCooldown (mantém banner na UI)
       │
       ├─ Cache < 5min? ─── SIM ──▶ loadPricesSuccess (sem HTTP — todas as abas)
       │
       ├─ É Follower? ────── SIM ──▶ EMPTY (aguarda broadcastSync$)
       │
       └─ É Líder ──────────────▶ fetchFromApi()
```

| Cenário | Comportamento |
|---------|--------------|
| Cache < 5 min | Serve dados do LocalStorage sem chamada HTTP |
| Cache expirado + Líder | Chama a API e atualiza o cache |
| Cache expirado + Follower | Aguarda o Líder via BroadcastChannel |
| Erro 429 + cache stale | Mantém dados na UI, entra em cooldown de 5 min |
| Erro 429 + sem cache | Exibe erro, entra em cooldown, retry automático |

---

## Countdown Sincronizado Entre Abas

O componente `RefreshCountdown` exibe uma barra SVG circular + texto MM:SS calculado via:

```typescript
Math.max(0, Math.ceil((CACHE_TTL_MS - (Date.now() - lastUpdated)) / 1000))
```

Como todas as abas compartilham o mesmo `lastUpdated` do localStorage (via cache hit ou via `broadcastSync$`), **todas exibem exatamente o mesmo countdown** — sem necessidade de sincronização adicional. O timer sobrevive a recarregamentos de página pela mesma razão.

---

## SSG Safety

A aplicação usa **Static Site Generation** (não runtime SSR). O Node.js executa o Angular durante o build para pré-renderizar o HTML — mas `localStorage`, `BroadcastChannel` e `window` não existem no Node.js.

Todas as APIs de browser são protegidas por dois mecanismos:

1. **`isPlatformBrowser()`**: guard síncrono nos effects (`loadPrices$` retorna `EMPTY` no Node.js)
2. **`afterNextRender()`**: `TabSyncService.init()` é chamado apenas após o primeiro render no browser — nunca durante o build

```typescript
// Effects — primeira linha do switchMap de loadPrices$
if (!isPlatformBrowser(this.platformId)) return EMPTY;

// Constructor dos Effects
afterNextRender(() => {
  this.tabSync.init(); // BroadcastChannel + Leader Election — browser apenas
  this.renderReady$.next();
});
```

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

// ✅ BEM com namespace atômico — seletor Angular == bloco BEM raiz
// selector: 'bc-skeleton'  →  classe raiz: .bc-skeleton
.bc-skeleton { ... }
.bc-skeleton__header { ... }
.bc-skeleton__line--wide { ... }
```

O seletor Angular é idêntico ao bloco BEM raiz (`selector == Block`). O prefixo `bc-` funciona como **namespace do produto** — mesmo sem Shadow DOM ou CSS Modules, dois componentes de equipes diferentes jamais colidirão enquanto usarem prefixos distintos.

### Por que isso importa em bancos

Sistemas financeiros geralmente possuem múltiplos micro-frontends, times distribuídos e um Design System corporativo central. O BEM permite que o DS defina estilos base (`.ds-button`, `.ds-card`) e cada produto os estenda sem risco (`bc-button--primary`), mantendo o CSS previsível e auditável.

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
| **S** — Single Responsibility | Componentes, Selectors, Services | `AssetCardComponent` só renderiza; `TabSyncService` só gerencia liderança; cada Selector só deriva um dado |
| **O** — Open/Closed | Reducer + Actions | Estendível via novas actions sem alterar o código do reducer existente — basta adicionar um novo `on()` |
| **L** — Liskov Substitution | `WatchlistAsset extends CoinMarket` | `WatchlistAsset` adiciona campos de portfólio mas nunca quebra o contrato de `CoinMarket` |
| **I** — Interface Segregation | `coin.interface.ts` | Interfaces específicas por responsabilidade — nenhum consumidor carrega campos desnecessários |
| **D** — Dependency Inversion | Services, Smart Components | `DashboardComponent` depende do `Store` (abstração); `WatchlistEffects` depende de `TabSyncService` (abstração) |

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

## Configuração de Proxy e Ambientes

A aplicação diferencia o tratamento de requisições HTTP conforme o ambiente de execução, resolvendo o bloqueio de CORS que a API pública da CoinGecko impõe a origens `localhost`.

### Desenvolvimento — Proxy Angular (`npm start`)

O `CoinGeckoService` usa a URL relativa `/api/coingecko` (definida em `environment.ts`). O dev server do Angular intercepta essas chamadas e as encaminha para o servidor da CoinGecko **via Node.js**, antes de chegarem ao browser — o que elimina o problema de CORS, pois a requisição parte de um processo Node e não de uma origem de browser.

```json
// proxy.conf.json
{
  "/api/coingecko": {
    "target": "https://api.coingecko.com/api/v3",
    "changeOrigin": true,
    "pathRewrite": { "^/api/coingecko": "" }
  }
}
```

### Produção — Chamada Direta (`npm run build:prod`)

Em produção, o Angular substitui `environment.ts` por `environment.prod.ts` via `fileReplacements` no `angular.json`. O `CoinGeckoService` passa a usar a URL absoluta `https://api.coingecko.com/api/v3`, que funciona diretamente do browser porque o domínio do GitHub Pages é aceito pela política CORS da API.

| Arquivo | `apiBase` | Quando se aplica |
|---------|-----------|-----------------|
| `environment.ts` | `/api/coingecko` | `npm start` (dev proxy) |
| `environment.prod.ts` | `https://api.coingecko.com/api/v3` | `npm run build:prod` |

---

## API

Este projeto consome a [CoinGecko API](https://www.coingecko.com/en/api) (plano gratuito — sem autenticação necessária para os endpoints utilizados).

O endpoint principal é `GET /coins/markets` com atualização automática a cada 5 minutos via NgRx Effects, coordenada pela aba Líder e distribuída para as Followers via BroadcastChannel API.

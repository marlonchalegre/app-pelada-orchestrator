# Mapa do site — Minha Pelada

Mapa de todas as rotas e fluxos possíveis do app web (`web-peladaapp`).
Fonte única das rotas: `src/App.tsx`. Este documento deve ser atualizado
sempre que uma rota ou fluxo mudar.

## Legenda

- **Pública** — acessível sem sessão.
- **Protegida** — exige autenticação (`ProtectedRoute`).
- `:id` — UUID de organização; `:token` — token público; `:user_id` — UUID de usuário.
- Rotas de tela usam `lazyRetry` (code-splitting por página).

## Rotas

### Públicas

| Rota | Página | Arquivo | Observações |
| --- | --- | --- | --- |
| `/` | Welcome | `features/auth/pages/WelcomePage.tsx` | Landing; leva a login/registro |
| `/login` | Login | `features/auth/pages/LoginPage.tsx` | Suporta `?redirect=` para voltar ao destino |
| `/register` | Registro | `features/auth/pages/RegisterPage.tsx` | Cria conta |
| `/first-access` | Primeiro acesso | `features/auth/pages/FirstAccessPage.tsx` | Aceita convite (`?token=`) |
| `/forgot-password` | Esqueci a senha | `features/auth/pages/ForgotPasswordPage.tsx` | Envia link |
| `/reset-password` | Redefinir senha | `features/auth/pages/ResetPasswordPage.tsx` | Recebe `?token=` |

### Protegidas

| Rota | Página | Arquivo | Observações |
| --- | --- | --- | --- |
| `/home` | Home | `features/home/pages/HomePage.tsx` | Dashboard multi-grupo; âncora `#meus-grupos` |
| `/join/:token` | Entrar em grupo | `features/organizations/pages/JoinOrganizationPage.tsx` | Convite por link |
| `/organizations/:id` | Grupo · Agenda | `features/organizations/pages/OrganizationDetailPage.tsx` | Visão admin e membro (abas AGENDA/ELENCO/ESTATÍSTICAS/FINANCEIRO/AJUSTES) |
| `/organizations/:id/statistics` | Grupo · Estatísticas | `features/organizations/pages/OrganizationStatisticsPage.tsx` | Ranking, presença, destaques |
| `/organizations/:id/management` | Grupo · Gestão | `features/organizations/pages/OrganizationManagementPage.tsx` | Abas por `?tab=` (ver abaixo) |
| `/peladas/:id` | Pelada · Detalhe/Súmula | `features/peladas/pages/PeladaDetailPage.tsx` | Times, placar, timeline |
| `/peladas/:id/build-schedule` | Montar tabela | `features/peladas/pages/ScheduleBuilderPage.tsx` | Planejamento de confrontos |
| `/peladas/:id/attendance` | Lista de presença | `features/peladas/pages/AttendanceListPage.tsx` | Confirmados/fila/pendentes/recusados |
| `/peladas/:id/matches` | Partidas | `features/peladas/pages/PeladaMatchesPage.tsx` | Súmula ao vivo / controle |
| `/peladas/:id/voting` | Votação MVP | `features/peladas/pages/PeladaVotingPage.tsx` | Voto por jogador |
| `/peladas/:id/results` | Resultado da votação | `features/peladas/pages/PeladaVotingResultsPage.tsx` | Pódio, ranking, transparência |
| `/profile` | Minha ficha | `features/user/pages/UserProfilePage.tsx` | Habilidades, presença, histórico |
| `/admin` | Painel de administração | `features/admin/pages/AdminPanelPage.tsx` | Somente super admin |

### Parâmetros de query

`/organizations/:id/management`:

- `tab` — `members` (padrão) · `finance` · `substitutions` · `waitlist` ·
  `ratings` · `admins` · `invitations` · `waha` · `settings`
- `page` — índice da página (0-based)
- `limit` — itens por página (padrão 10)

`/login` e `/register`: `redirect` (destino pós-login).

## Fluxos

### 1. Onboarding e autenticação

```
/  ──▶ /register ──▶ /home
│          │
│          └─▶ /first-access?token=… ──▶ /join/:token ──▶ /organizations/:id
│
├─▶ /login ──▶ /home
│      └─▶ /forgot-password ──▶ /reset-password?token=… ──▶ /login
```

### 2. Home → grupo

```
/home
 ├─▶ "Meus grupos" (âncora #meus-grupos) ──▶ /organizations/:id
 ├─▶ criar organização (diálogo) ──▶ /organizations/:id
 └─▶ convite pendente ──▶ aceitar ──▶ /organizations/:id
```

### 3. Grupo (abas de navegação)

```
/organizations/:id ──┬─ AGENDA ─────────────▶ /organizations/:id
                     ├─ ELENCO ─────────────▶ /organizations/:id/management?tab=members
                     ├─ ESTATÍSTICAS ───────▶ /organizations/:id/statistics
                     ├─ FINANCEIRO ─────────▶ /organizations/:id/management?tab=finance
                     └─ AJUSTES ────────────▶ /organizations/:id/management?tab=settings

/organizations/:id/management
 ├─ Membros ─────────▶ convidar / adicionar / remover
 ├─ Financeiro ──────▶ configurar, transações, pagamentos mensais
 ├─ Substituições · Fila de espera · Notas · Admins · Convites · WhatsApp
 └─ Configurações ───▶ dados gerais + zona de perigo (excluir organização)
```

### 4. Ciclo de vida da pelada

```
Gestão do grupo: CRIAR PELADA ─▶ /peladas/:id/attendance  (lista aberta)
                                        │
                                        ├─ confirmar/recusar/fila de espera (membro)
                                        ├─ diaristas, convidados, mensalistas
                                        └─ admin: FECHAR LISTA E SORTEAR TIMES
                                                   │
                                                   ▼
                                          /peladas/:id  (times sorteados)
                                                   │
                     Algoritmo de sorteio: Clássico · Gemini · ChatGPT (+ sinais históricos)
                                                   │
                                                   ▼
                                          /peladas/:id/build-schedule
                                                   │
                                                   ▼
                                          /peladas/:id/matches  (súmula ao vivo)
                                                   │
                                                   ▼
                                          /peladas/:id/voting ──▶ /peladas/:id/results
                                                   │
                                        encerrar pelada ──▶ status "closed" (súmula)
```

### 5. Ficha do jogador

```
/perfil (Minha ficha)
 ├─ habilidades (barras)
 ├─ presença · últimas 12 semanas
 ├─ estatísticas por grupo/esporte
 └─ histórico de peladas ──▶ /peladas/:id
```

### 6. Administração global

```
Menu do usuário (super admin) ──▶ /admin
 ├─ Organizações (bloquear, feature flags)
 ├─ Usuários (bloquear, resetar senha, tornar admin global)
 └─ Peladas (excluir)
```

## Regras de acesso

- `is_super_admin` — únicos que veem `/admin` no menu do usuário.
- Admin de organização (`admin_orgs`) — acessa a aba AJUSTES/Gestão e ações
  destrutivas da pelada; membros veem a mesma tela sem as ações de admin.
- `allow_org_creation` — habilita o botão "Criar Organização" na home.
- Feature flags por organização (ex.: `org_statistics`, `finance_control`,
  `finance_control`) escondem/bloqueiam abas específicas.

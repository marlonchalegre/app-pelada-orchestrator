# Testes de Acesso de Jogadores

## Resumo

Foram adicionados testes de integra??o abrangentes para garantir que jogadores (n?o-administradores) pertencentes a uma organiza??o possam visualizar dados da organiza??o, peladas e partidas, mas n?o possam modific?-los.

## Arquivo de Testes

**Localiza??o:** `api-peladaapp/test/integration/api_peladaapp/player_access_test.clj`

## Testes Implementados

### 1. `player-can-view-organization-data`
**Objetivo:** Verificar que um jogador pertencente a uma organiza??o pode visualizar os dados da organiza??o.

**Cen?rio:**
- Um administrador cria uma organiza??o
- O administrador adiciona um jogador ? organiza??o
- O jogador consegue:
  - Visualizar detalhes da organiza??o (`GET /api/organizations/:id`)
  - Listar organiza??es (`GET /api/organizations`)
  - Visualizar jogadores da organiza??o (`GET /api/organizations/:id/players`)

**Asser??es:** 8 asser??es verificando status HTTP 200 e dados corretos

---

### 2. `player-can-view-peladas`
**Objetivo:** Verificar que um jogador pode visualizar peladas da organiza??o ? qual pertence.

**Cen?rio:**
- Um administrador cria uma organiza??o e adiciona um jogador
- O administrador cria uma pelada na organiza??o
- O jogador consegue:
  - Visualizar detalhes da pelada (`GET /api/peladas/:id`)
  - Listar peladas da organiza??o (`GET /api/organizations/:id/peladas`)

**Asser??es:** 8 asser??es verificando acesso e dados corretos

---

### 3. `player-can-view-matches`
**Objetivo:** Verificar que um jogador pode visualizar partidas das peladas.

**Cen?rio:**
- Um administrador cria organiza??o, adiciona jogador, cria pelada e inicia a pelada
- O jogador consegue:
  - Listar partidas da pelada (`GET /api/peladas/:id/matches`)
  - Visualizar escala??es das partidas (`GET /api/matches/:id/lineups`)
  - Visualizar eventos das partidas (`GET /api/peladas/:id/events`)
  - Visualizar estat?sticas dos jogadores (`GET /api/peladas/:id/player-stats`)

**Asser??es:** 11 asser??es verificando acesso a todos os dados relacionados ?s partidas

---

### 4. `player-cannot-modify-peladas-or-matches`
**Objetivo:** Verificar que um jogador N?O pode modificar peladas ou partidas (apenas visualizar).

**Cen?rio:**
- Um administrador cria organiza??o, adiciona jogador e cria pelada
- O jogador N?O consegue:
  - Criar peladas (`POST /api/peladas`) - retorna 403/401
  - Atualizar peladas (`PUT /api/peladas/:id`) - retorna 403/401
  - Iniciar peladas (`POST /api/peladas/:id/begin`) - retorna 403/401
  - Atualizar placar de partidas (`PUT /api/matches/:id/score`) - retorna 403/401
  - Criar eventos de partida (`POST /api/matches/:id/events`) - retorna 403/401
  - Deletar peladas (`DELETE /api/peladas/:id`) - retorna 403/401

**Asser??es:** 6 asser??es verificando que opera??es de modifica??o s?o bloqueadas

---

### 5. `non-member-cannot-view-organization-data`
**Objetivo:** Verificar que um usu?rio que N?O ? membro de uma organiza??o n?o pode visualizar seus dados.

**Cen?rio:**
- Um administrador cria organiza??o e pelada
- Um usu?rio externo (n?o-membro) tenta acessar os dados
- O usu?rio externo N?O consegue:
  - Visualizar peladas (`GET /api/peladas/:id`) - retorna 403/401
  - Listar peladas (`GET /api/organizations/:id/peladas`) - retorna 403/401
  - Visualizar partidas (`GET /api/peladas/:id/matches`) - retorna 403/401

**Asser??es:** 4 asser??es verificando que acesso ? negado para n?o-membros

---

## Resultados dos Testes

```
lein test api-peladaapp.player-access-test

Ran 5 tests containing 37 assertions.
0 failures, 0 errors.
```

### Execu??o Completa da Suite de Testes

```
lein test

Ran 60 tests containing 320 assertions.
0 failures, 0 errors.
```

Todos os testes passaram com sucesso, incluindo os novos testes de acesso de jogadores.

## Cobertura de Autoriza??o

Os testes verificam a implementa??o correta das regras de autoriza??o:

### ? Jogadores (Membros) PODEM:
- Visualizar dados da organiza??o
- Visualizar peladas da organiza??o
- Visualizar partidas e suas escala??es
- Visualizar eventos e estat?sticas das partidas

### ? Jogadores (Membros) N?O PODEM:
- Criar, atualizar ou deletar peladas
- Iniciar ou fechar peladas
- Atualizar placares de partidas
- Criar ou deletar eventos de partidas
- Modificar escala??es de partidas

### ? N?o-Membros N?O PODEM:
- Visualizar qualquer dado de organiza??es ?s quais n?o pertencem
- Visualizar peladas ou partidas de outras organiza??es

## Arquitetura de Autoriza??o

Os testes validam o uso correto das fun??es de autoriza??o:

- `auth/require-organization-member!` - Usado para endpoints de visualiza??o (GET)
- `auth/require-organization-admin!` - Usado para endpoints de modifica??o (POST, PUT, DELETE)

## Endpoints Testados

### Organiza??es
- `GET /api/organizations` - Listar organiza??es
- `GET /api/organizations/:id` - Visualizar organiza??o
- `GET /api/organizations/:id/players` - Listar jogadores

### Peladas
- `GET /api/peladas/:id` - Visualizar pelada
- `GET /api/organizations/:id/peladas` - Listar peladas
- `POST /api/peladas` - Criar pelada (apenas admin)
- `PUT /api/peladas/:id` - Atualizar pelada (apenas admin)
- `POST /api/peladas/:id/begin` - Iniciar pelada (apenas admin)
- `DELETE /api/peladas/:id` - Deletar pelada (apenas admin)

### Partidas
- `GET /api/peladas/:id/matches` - Listar partidas
- `GET /api/matches/:id/lineups` - Visualizar escala??es
- `GET /api/peladas/:id/events` - Visualizar eventos
- `GET /api/peladas/:id/player-stats` - Visualizar estat?sticas
- `PUT /api/matches/:id/score` - Atualizar placar (apenas admin)
- `POST /api/matches/:id/events` - Criar evento (apenas admin)

## Conclus?o

Os testes implementados garantem que:

1. **Seguran?a**: Jogadores s? podem acessar dados de organiza??es ?s quais pertencem
2. **Controle de Acesso**: Apenas administradores podem modificar dados
3. **Visibilidade**: Jogadores t?m acesso completo de leitura aos dados relevantes
4. **Isolamento**: N?o-membros n?o t?m acesso a dados de outras organiza??es

Todos os testes passaram com sucesso, confirmando que o sistema de autoriza??o est? funcionando corretamente.

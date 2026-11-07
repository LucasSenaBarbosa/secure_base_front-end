# SecureBase Frontend

Simulador web de uma casa inteligente com ESP32 e kit Keyestudio KS5009. A
interface modela sensores, motores, LCD, LEDs, alertas, ligações e lições em
tempo simulado. A autenticação e os dados de conta são tratados pela API
Python do SecureBase; o navegador não acessa o Supabase diretamente.

## Tecnologias e estrutura

- React, TypeScript e Vite. 
- Three.js e React Three Fiber para a cena 3D.
- Zustand para estado do simulador; ECharts para gráficos.
- `src/sim/`: domínio e estado do simulador, firmware, hardware, sensores,
  eventos e ligações. 
- `src/ui/`: telas e componentes de interface; `src/ui/session.ts` coordena o
  estado da sessão exibido pela interface.
- `src/three/`: cena 3D, componentes de renderização e integração dos modelos.
- `src/auth/`: cliente HTTP da API, tipos de autenticação e utilitários de tema
  e armazenamento local.
- `src/optimization/`: tipos, estado (Zustand) e regras puras do laboratório
  de otimização de sensores; a página fica em `src/ui/Optimization.tsx` e a
  cena em `src/three/OptimizationScene.tsx`.
- `src/main.tsx`: ponto de entrada React; carrega tema e estilos globais e monta
  a aplicação.
- `public/`: imagens, modelos e outros recursos estáticos.
- `scripts/generate_protoboard.mjs`: gera o modelo da protoboard usado no
  desenvolvimento e no build.

A estrutura separa responsabilidades por áreas do frontend: simulação,
apresentação, renderização 3D e comunicação com a API. A interface compõe essas
partes, enquanto o estado do simulador permanece separado da sessão e dos dados
de conta mantidos pela API. Essa organização ajuda a localizar e evoluir cada
área sem sugerir que sejam camadas do contrato HTTP ou que toda funcionalidade
esteja agrupada em uma única pasta.

## Configuração e execução

Requer Node.js 20 ou superior. No PowerShell, abra a pasta
`secure_base_front-end` — onde está o `package.json` — e instale as dependências:

```powershell
npm ci
```

Copie `.env.example` para `.env.local`:

```powershell
Copy-Item .env.example .env.local
```

O exemplo configura `VITE_API_BASE_URL=http://localhost:8000` para
desenvolvimento local. Em produção, configure a URL pública da API no ambiente
de build do provedor; o build falha se a variável estiver ausente ou apontar
para localhost. Valores `VITE_*` são incluídos no bundle do frontend; nunca
coloque chaves Supabase, segredos JWT ou outras credenciais nessas variáveis.

Inicie o servidor local:

```powershell
npm run dev
```

Abra `http://localhost:5173`. A simulação roda no navegador; para entrar na
aplicação e acessar suas telas, o cadastro, o login e a validação da sessão
dependem da API SecureBase em execução.

## Laboratório de otimização

A página **Otimização** reutiliza a maquete 3D (`HouseV2`, com paredes
translúcidas) para planejar sensores com o algoritmo NSGA-II executado pela API:

1. Escolha a residência. Sem layout salvo, a API devolve o layout-base da
   maquete, com orçamento e custos vazios.
2. Na aba **Casa**, revise ambientes, pontos críticos e pontos candidatos; na
   aba **Sensores**, informe orçamento, custos, estoque e alcance. Salve o
   layout (primary ou master da residência).
3. Na cena, use **Posicionar**, **Mover** e **Remover** sobre os candidatos (◆)
   para montar a configuração manual. As métricas são calculadas pela API.
4. Em **Executar**, rode o NSGA-II. Em **Pareto**, compare as alternativas
   calculadas com a configuração manual e escolha um critério para ordená-las.
   O selo na cena indica sempre se a configuração exibida é manual ou
   calculada.
5. **Aplicar melhor opção** (aba **Pareto**) carrega como configuração manual a
   primeira solução pelo critério e pelos filtros escolhidos. O critério padrão,
   **Equilibrada**, fica com a solução de menor custo entre as que atingem o
   limiar de cobertura do layout; se nenhuma atinge, fica com a de maior
   cobertura. A configuração aplicada pode ser editada e só fica guardada
   depois de salva com um nome na aba **Sensores**. Se a execução usou outra
   versão do layout, o botão recusa e pede uma nova otimização.

O modelo matemático, os endpoints e as limitações estão em
`secure_base_back-end/docs/optimization.md`.


## Build e verificações

```powershell
npm test
npm run build
npm run preview
```

`npm test` executa os testes unitários com Vitest (regras de dominância,
ordenação, escolha da melhor opção, filtros e edição da configuração manual). O
build gera o modelo da protoboard, verifica os tipos com `tsc -b` e compila
para produção com Vite. O workflow
[`frontend-ci.yml`](./.github/workflows/frontend-ci.yml) executa `npm ci`,
`npm test` e `npm run build` em pushes e pull requests, confere o tamanho do
pacote inicial (`scripts/check_bundle.mjs`) e guarda o `dist/` como artefato;
não realiza deploy.

## Desempenho do carregamento

- **Páginas sob demanda:** `src/ui/App.tsx` carrega cada página com
  `React.lazy`. Login e o menu vêm no pacote inicial; o resto (Landing, 3D,
  gráficos) só é baixado quando a página é aberta.
- **Bibliotecas separadas:** `vite.config.ts` coloca three.js/React Three
  Fiber, ECharts e React em arquivos próprios, reaproveitados do cache do
  navegador entre deploys.
- **ECharts modular:** `src/ui/echarts.ts` registra só os gráficos e
  componentes usados. Ao usar um tipo de série ou componente novo, registre-o
  lá, senão o gráfico não aparece.
- **Orçamento do pacote inicial:** `npm run check:bundle` (após o build) falha
  se o JS carregado na primeira tela passar de 300 KB. Ao subir o limite, anote
  o motivo no script.

Referência (novembro de 2026): o pacote inicial caiu de 2.634 KB (806 KB
gzip), quando tudo vinha num único arquivo, para cerca de 211 KB (71 KB gzip).
Os modelos `.glb` em `public/models/` (≈7 MB) continuam sem compressão.

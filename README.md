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

## Build e verificações

```powershell
npm run build
npm run preview
```

O build gera o modelo da protoboard, verifica os tipos com `tsc -b` e compila
para produção com Vite. Não há runner ou script de testes automatizados
configurado neste repositório. O workflow
[`frontend-ci.yml`](./.github/workflows/frontend-ci.yml) executa `npm ci` e
`npm run build` em pushes e pull requests; não realiza deploy.

# SecureBase Frontend

Simulador web de uma casa inteligente com ESP32 e kit Keyestudio KS5009. A
interface modela sensores, motores, LCD, LEDs, alertas, ligações e lições em
tempo simulado. A autenticação e os dados de conta são tratados pela API
Python do SecureBase; o navegador não acessa o Supabase diretamente.
 
## Tecnologias e estrutura

- React, TypeScript e Vite. 
- Three.js e React Three Fiber para a cena 3D.
- Zustand para estado do simulador; ECharts para gráficos.
- `src/sim/`: firmware, hardware, sensores e estado simulado.
- `src/ui/`: telas, componentes e experiência do usuário.
- `src/three/`: cena 3D e modelos.
- `src/auth/`: integração HTTP com a API e estado de autenticação.
- `public/`: imagens, modelos e outros recursos estáticos.

## Configuração e execução

Requer Node.js 20 ou superior. A partir da raiz do repositório:

```sh
npm ci
```

Copie `.env.example` para `.env.local` e configure `VITE_API_BASE_URL` com a URL
da API. O exemplo aponta para `http://localhost:8000` para desenvolvimento
local. Em produção, configure a URL pública da API no ambiente de build do
provedor; o build falha se a variável estiver ausente ou apontar para localhost.
Valores `VITE_*` são incluídos no bundle do frontend; nunca coloque chaves
Supabase, segredos JWT ou credenciais nessas variáveis.

```sh
npm run dev
```

Abra `http://localhost:5173`. O simulador funciona no navegador; os fluxos de
cadastro e login dependem da API SecureBase em execução.

## Build e verificações

```sh
npm run build
npm run preview
```

O build gera o modelo da protoboard, verifica os tipos com `tsc -b` e compila
para produção com Vite. Não há runner ou script de testes automatizados
configurado neste repositório. O workflow
[`frontend-ci.yml`](./.github/workflows/frontend-ci.yml) executa `npm ci` e
`npm run build` em pushes e pull requests; não realiza deploy.

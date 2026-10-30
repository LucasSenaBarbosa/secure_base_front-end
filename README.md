# SecureBase — simulador Keyestudio KS5009

Simulador no navegador de uma casa inteligente ESP32. O firmware em tempo
simulado controla motores, sensores, LCD, LEDs, alertas e as lições do kit
KS5009.

## Executar o frontend

1. Execute:

   ```bash
   npm install
   npm run dev
   ```

Abra `http://localhost:5173`. O cadastro e o login usam a API Python, que
armazena as contas no PostgreSQL e emite os tokens de sessão. O cadastro não
confirma o e-mail nem depende de SMTP. O frontend não usa Supabase Auth nem
precisa de chaves do Supabase. Contas antigas do Supabase Auth não são
migradas; seus usuários devem se cadastrar novamente. O papel global
`master` deve ser atribuído manualmente conforme o manual do backend.

## O que está simulado

- Firmware de casa inteligente e lições no estilo do tutorial KS5009.
- Sensores de temperatura, umidade, gás, chuva e presença, além de inércia do
  motor.
- App Wi-Fi, monitor serial, GPIO, gravação simulada de sketch e reset da placa.
- Cena React Three Fiber, efeitos visuais e áudio do buzzer ativado pelo usuário.

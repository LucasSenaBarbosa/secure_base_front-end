import { useEffect, useRef } from 'react';
import { LandingFx } from './LandingFx';
import { HouseHero, PartCarousel, useStill } from './LandingStage';
import { Logo } from './Logo';
import { ThemeLauncher } from './ThemeDrawer';
import { useSession } from './session';
import './landing.css';

const STEPS = [
  { n: '01', title: 'Olhe a casa', text: 'O laboratório é o gêmeo do kit: o que o painel pede, o modelo faz.', image: '/brand/securebase-hero.jpg', focus: '30% center' },
  { n: '02', title: 'Siga o fio', text: 'A protoboard mostra por onde passa a corrente de cada módulo.', image: '/brand/scene-wires.jpg', focus: 'center' },
  { n: '03', title: 'Leia o código', text: 'O firmware explica o comportamento e a telemetria confirma o resultado.', image: '/brand/part-lcd.jpg', focus: 'center' },
];

const TICKER = ['ESP32 PLUS', 'LCD 1602', 'DHT11', 'Servo SG90', 'PIR', 'MQ-2', 'SK6812 RGB', 'RFID RC522', 'Buzzer', 'Ventilador', 'Sensor de vapor', 'Casa V2'];

function Ticker({ reverse = false }: { reverse?: boolean }) {
  return (
    <div className={`land-ticker${reverse ? ' reverse' : ''}`} aria-hidden="true">
      <div className="land-ticker-track">
        {[0, 1].map((copy) => (
          <span key={copy}>
            {TICKER.map((word) => <em key={word}>{word}<i>✦</i></em>)}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Landing() {
  const enter = useSession((s) => s.enter);
  const root = useRef<HTMLDivElement>(null);
  const still = useStill();

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const reveals = [...el.querySelectorAll('.reveal')];
    const photos = [...el.querySelectorAll<HTMLElement>('.land-photo')];
    const bar = el.querySelector<HTMLElement>('.land-progress');
    const header = el.querySelector('.land-bar');

    const mark = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (bar) bar.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
      header?.classList.toggle('scrolled', window.scrollY > 8);
      reveals.forEach((node) => {
        if (node.getBoundingClientRect().top < window.innerHeight * 0.88) node.classList.add('in');
      });
      if (reduce) return;
      photos.forEach((node) => {
        const rect = node.getBoundingClientRect();
        const delta = (rect.top + rect.height / 2 - window.innerHeight / 2) / window.innerHeight;
        const shift = Math.max(-18, Math.min(18, delta * -24));
        node.style.setProperty('--shift', `${shift}px`);
      });
    };

    const move = (event: PointerEvent) => {
      el.style.setProperty('--mx', `${event.clientX}px`);
      el.style.setProperty('--my', `${event.clientY}px`);
      const card = (event.target as Element | null)?.closest<HTMLElement>('.fx-spot');
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      card.style.setProperty('--px', `${x * 100}%`);
      card.style.setProperty('--py', `${y * 100}%`);
      card.style.setProperty('--rx', `${(0.5 - y) * 7}deg`);
      card.style.setProperty('--ry', `${(x - 0.5) * 9}deg`);
    };
    const leave = (event: PointerEvent) => {
      const card = (event.target as Element | null)?.closest<HTMLElement>('.fx-spot');
      if (card && !card.contains(event.relatedTarget as Node | null)) {
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
      }
    };

    mark();
    window.addEventListener('scroll', mark, { passive: true });
    window.addEventListener('resize', mark);
    if (!reduce && window.matchMedia('(pointer: fine)').matches) {
      window.addEventListener('pointermove', move, { passive: true });
      el.addEventListener('pointerout', leave);
    }
    return () => {
      window.removeEventListener('scroll', mark);
      window.removeEventListener('resize', mark);
      window.removeEventListener('pointermove', move);
      el.removeEventListener('pointerout', leave);
    };
  }, []);

  return (
    <div className="landing" ref={root}>
      <LandingFx still={still} />
      <header className="land-bar">
        <div className="brand">
          <Logo />
          <div><strong>SecureBase</strong><small>Casa inteligente</small></div>
        </div>
        <ThemeLauncher />
        <span className="land-progress" />
      </header>

      <section className="land-hero">
        <div className="land-hero-copy">
          <p className="land-kicker">Simulador do kit KS5009</p>
          <h1 className="fx-title">A casa, a protoboard e o firmware no mesmo lugar.</h1>
          <p>O SecureBase mostra o que um ESP32 faria no kit: sensores, atuadores e o código que os liga. Ao lado, a casa premium V2 — a maquete nova, com os mesmos módulos no lugar.</p>
          <button className="primary land-next fx-glow" onClick={enter}>Abrir o simulador</button>
        </div>
        <figure className="land-frame fx-border">
          <HouseHero />
          <figcaption className="land-badge"><i /> Casa V2 · ao vivo</figcaption>
        </figure>
      </section>

      <Ticker />

      <PartCarousel />

      <Ticker reverse />

      <section className="land-split">
        <div>
          <div className="reveal">
            <p className="land-kicker">O projeto</p>
            <h2 className="fx-title">Um gêmeo digital para estudar a casa inteligente.</h2>
          </div>
          <p className="reveal">Não é só um desenho. A placa virtual lê temperatura, umidade, gás e presença, aciona servos e escreve no LCD. A ideia é ver o funcionamento do kit sem precisar montar tudo de novo a cada teste.</p>
        </div>
        <figure className="reveal land-photo fx-border">
          <img src="/brand/scene-wires.jpg" alt="Fios coloridos ligando a protoboard à casa" />
        </figure>
      </section>

      <section className="land-steps">
        {STEPS.map((step, index) => (
          <article key={step.n} className="reveal land-step fx-spot" style={{ transitionDelay: `${index * 90}ms` }}>
            <figure>
              <img src={step.image} alt="" style={{ objectPosition: step.focus }} />
            </figure>
            <span>{step.n}</span>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
          </article>
        ))}
      </section>

      <section className="land-split flip">
        <div>
          <div className="reveal">
            <p className="land-kicker">O intuito</p>
            <h2 className="fx-title">Entender a ligação antes de mexer no hardware.</h2>
          </div>
          <p className="reveal">Serve para apresentar o projeto, testar automações e acompanhar a telemetria. A chuva fecha a janela, o gás dispara o alarme e cada fio da protoboard conta o que aquele pino está fazendo.</p>
        </div>
        <figure className="reveal land-photo fx-border">
          <img src="/brand/scene-rain.jpg" alt="A casa de madeira sob chuva, com a janela acesa" />
        </figure>
      </section>

      <section className="land-end reveal">
        <h2 className="fx-title">Pronto para entrar.</h2>
        <p>O próximo passo abre o simulador.</p>
        <button className="primary land-next fx-glow" onClick={enter}>Próximo</button>
      </section>
    </div>
  );
}

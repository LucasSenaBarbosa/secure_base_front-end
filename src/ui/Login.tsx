import { useState } from 'react';
import { Logo } from './Logo';
import { useSession } from './session';
import { ThemeLauncher } from './ThemeDrawer';

export function LoginScreen() {
  const signIn = useSession((s) => s.signIn);
  const signUp = useSession((s) => s.signUp);
  const authError = useSession((s) => s.error);
  const [mode, setMode] = useState<'enter' | 'create'>('enter');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      if (mode === 'enter') {
        await signIn(email.trim(), password);
        return;
      }
      const display = name.trim();
      if (display.length < 2) {
        setError('Informe o nome de quem vai usar.');
        return;
      }
      if (password.length < 8 || password.length > 128) {
        setError('A senha precisa ter entre 8 e 128 caracteres.');
        return;
      }
      if (password !== confirm) {
        setError('As senhas não coincidem.');
        return;
      }
      const result = await signUp(email.trim(), password, display);
      setMode('enter');
      setPassword('');
      setConfirm('');
      setNotice(result.message);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Não foi possível concluir a autenticação.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="theme-float"><ThemeLauncher /></div>
      <form className="login-card" onSubmit={submit}>
        <div className="brand">
          <Logo />
          <div><strong>SecureBase</strong><small>Casa inteligente</small></div>
        </div>
        <h1>{mode === 'enter' ? 'Entrar' : 'Criar usuário'}</h1>
        {mode === 'create' && <p>Crie sua conta e entre com o e-mail e a senha informados. O endereço não será confirmado por e-mail.</p>}
        {mode === 'create' && (
          <label>Nome<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" minLength={2} maxLength={120} required /></label>
        )}
        <label>E-mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
        {mode === 'create' && <label>Senha<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} maxLength={128} required /></label>}
        {mode === 'enter' && <label>Senha<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" maxLength={128} required /></label>}
        {mode === 'create' && (
          <label>Confirmar senha<input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" minLength={8} maxLength={128} required /></label>
        )}
        {(error || authError) && <p className="login-error">{error || authError}</p>}
        {notice && <p className="login-ok">{notice}</p>}
        <button className="primary login-submit" disabled={busy}>{busy ? 'Aguarde…' : mode === 'enter' ? 'Entrar' : 'Criar conta'}</button>
        <button
          type="button"
          className="login-switch"
          onClick={() => { setMode(mode === 'enter' ? 'create' : 'enter'); setError(''); setNotice(''); }}
        >
          {mode === 'enter' ? 'Criar outro usuário' : 'Já tenho conta'}
        </button>
      </form>
    </div>
  );
}

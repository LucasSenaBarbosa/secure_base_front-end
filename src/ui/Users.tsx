import { Shield, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { secureBaseApi, type HomeProfile, type UserProfile } from '../auth/api';
import { useSession } from './session';

export function UsersPage() {
  const signOut = useSession((s) => s.signOut);
  const [homes, setHomes] = useState<HomeProfile[]>([]);
  const [activeHomeId, setActiveHomeId] = useState('');
  const [homeName, setHomeName] = useState('');
  const [accounts, setAccounts] = useState<UserProfile[]>([]);
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [ownPassword, setOwnPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const activeHome = homes.find((home) => home.id === activeHomeId);
  const canManageUsers = activeHome?.role === 'primary' || activeHome?.role === 'master';

  useEffect(() => {
    let active = true;
    secureBaseApi.listHomes().then((availableHomes) => {
      if (!active) return;
      setHomes(availableHomes);
      setActiveHomeId((current) => (
        availableHomes.some((home) => home.id === current)
          ? current
          : availableHomes[0]?.id ?? ''
      ));
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar as contas.');
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!activeHomeId || !canManageUsers) {
      setAccounts([]);
      return;
    }
    let active = true;
    secureBaseApi.listHomeUsers(activeHomeId).then((users) => {
      if (active) setAccounts(users);
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar os usuários da residência.');
    });
    return () => { active = false; };
  }, [activeHomeId, canManageUsers]);

  const createHome = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const home = await secureBaseApi.createHome(homeName.trim());
      setHomes((current) => [...current, home]);
      setActiveHomeId(home.id);
      setHomeName('');
      setNotice(`Residência ${home.name} criada. Você é o administrador primary.`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Não foi possível criar a residência.');
    } finally {
      setBusy(false);
    }
  };

  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    if (!canManageUsers || !activeHome) {
      setError('Selecione uma residência que você administra.');
      return;
    }
    setBusy(true);
    try {
      const user = await secureBaseApi.addHomeUser(activeHome.id, email.trim());
      setAccounts((current) => [...current.filter((item) => item.id !== user.id), user]);
      setEmail('');
      setNotice(`Acesso de ${user.email} associado a ${activeHome.name}.`);
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : 'Não foi possível associar o usuário.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (account: UserProfile) => {
    setError('');
    setNotice('');
    if (!canManageUsers || !activeHome || account.role !== 'member') return;
    if (!window.confirm(`Remover o acesso de ${account.email}?`)) return;
    setBusy(true);
    try {
      await secureBaseApi.removeHomeUser(activeHome.id, account.id);
      setAccounts((current) => current.filter((row) => row.id !== account.id));
      setNotice(`O acesso de ${account.email} foi removido de ${activeHome.name}.`);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Não foi possível remover a conta.');
    } finally {
      setBusy(false);
    }
  };

  const transferPrimary = async (account: UserProfile) => {
    if (!activeHome || activeHome.role !== 'master' || account.role !== 'member') return;
    if (!window.confirm(`Tornar ${account.email} administrador primary de ${activeHome.name}?`)) return;
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const updatedHome = await secureBaseApi.transferHomePrimary(activeHome.id, account.id);
      setHomes((current) => current.map((home) => (
        home.id === updatedHome.id
          ? { ...home, primary_user_id: updatedHome.primary_user_id }
          : home
      )));
      setAccounts((current) => current.map((user) => (
        user.id === account.id
          ? { ...user, role: 'primary' }
          : user.role === 'primary'
            ? { ...user, role: 'member' }
            : user
      )));
      setNotice(`${account.email} agora é primary de ${activeHome.name}.`);
    } catch (transferError) {
      setError(transferError instanceof Error ? transferError.message : 'Não foi possível transferir a residência.');
    } finally {
      setBusy(false);
    }
  };

  const changeOwn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    if (ownPassword.length < 8 || ownPassword.length > 128) {
      setError('A nova senha precisa ter entre 8 e 128 caracteres.');
      return;
    }
    setBusy(true);
    try {
      await secureBaseApi.changePassword(currentPassword, ownPassword);
      await signOut();
      setOwnPassword('');
      setCurrentPassword('');
      setNotice('Senha atualizada. Entre novamente com a nova senha.');
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Não foi possível atualizar a senha.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page users-page">
      <header className="page-head">
        <div>
          <span className="eyebrow">SecureBase · acesso</span>
          <h1>Usuários</h1>
          <p>{canManageUsers ? 'Gerencie os acessos apenas na residência selecionada.' : 'Você pode trocar a sua senha ou criar uma residência.'}</p>
        </div>
      </header>
      <form className="user-form" onSubmit={createHome}>
        <h2>Criar residência</h2>
        <label>Nome da residência<input value={homeName} onChange={(e) => setHomeName(e.target.value)} minLength={2} maxLength={120} required /></label>
        <button className="primary" type="submit" disabled={busy}>{busy ? 'Aguarde…' : 'Criar residência'}</button>
      </form>
      {homes.length > 0 && (
        <label className="user-form">
          Residência
          <select value={activeHomeId} onChange={(e) => setActiveHomeId(e.target.value)}>
            {homes.map((home) => <option key={home.id} value={home.id}>{home.name}</option>)}
          </select>
        </label>
      )}
      <div className="user-list">
        {accounts.map((account) => (
          <article key={account.id} className="user-row">
            <div>
              <b>{account.name}</b>
              <small>{account.email}</small>
            </div>
            <span className={account.role !== 'member' ? 'role primary' : 'role'}><Shield size={12} /> {account.role === 'master' ? 'Adm master' : account.role === 'primary' ? 'Administrador da casa' : 'Usuário'}</span>
            {canManageUsers && account.role === 'member' && (
              <button type="button" disabled={busy} onClick={() => { void remove(account); }} aria-label={`Remover ${account.email}`}><Trash2 size={14} /> Remover</button>
            )}
            {activeHome?.role === 'master' && account.role === 'member' && (
              <button type="button" disabled={busy} onClick={() => { void transferPrimary(account); }}>
                Tornar primary
              </button>
            )}
          </article>
        ))}
      </div>
      {activeHome && !canManageUsers && (
        <p>Somente o administrador desta residência pode listar e gerenciar seus usuários.</p>
      )}
      {canManageUsers && (
        <form className="user-form" onSubmit={addMember}>
          <h2>Associar usuário cadastrado</h2>
          <label>E-mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <button className="primary" type="submit" disabled={busy}>{busy ? 'Aguarde…' : 'Associar usuário'}</button>
        </form>
      )}
      <form className="user-form" onSubmit={changeOwn}>
        <h2>Minha senha</h2>
        <label>Senha atual<input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" maxLength={128} required /></label>
        <label>Nova senha<input type="password" value={ownPassword} onChange={(e) => setOwnPassword(e.target.value)} autoComplete="new-password" minLength={8} maxLength={128} required /></label>
        <div className="user-actions">
          <button className="primary" type="submit" disabled={busy}>Atualizar senha</button>
          <button type="button" className="ghost" onClick={signOut}>Sair desta conta</button>
        </div>
      </form>
      {error && <p className="login-error">{error}</p>}
      {notice && <p className="login-ok">{notice}</p>}
    </div>
  );
}

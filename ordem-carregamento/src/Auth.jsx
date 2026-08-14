import React, { useState } from 'react';
import { supabase } from './supabaseClient';

export default function Auth() {
  const [mode, setMode] = useState('login'); // login | signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg(error.message);
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setMsg(error.message);
      else setMsg('Conta criada! Se a confirmação por e-mail estiver ativada no seu projeto Supabase, verifique sua caixa de entrada antes de entrar.');
    }
    setBusy(false);
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#EDE6D3', fontFamily: 'system-ui, sans-serif', padding: '1rem',
    }}>
      <form onSubmit={submit} style={{
        background: '#F6F2E7', border: '1px solid #C7BC9E', borderRadius: 12,
        padding: '2rem', width: '100%', maxWidth: 360,
      }}>
        <h1 style={{ fontSize: '1.3rem', margin: '0 0 0.3rem', color: '#2C4128' }}>Ordem de Carregamento</h1>
        <p style={{ fontSize: '0.85rem', color: '#5B6350', margin: '0 0 1.4rem' }}>
          {mode === 'login' ? 'Entre com sua conta' : 'Crie sua conta para acessar'}
        </p>

        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.3rem' }}>E-mail</label>
        <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
          style={{ width: '100%', padding: '0.6rem', marginBottom: '0.9rem', borderRadius: 6, border: '1px solid #A79A76' }} />

        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.3rem' }}>Senha</label>
        <input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)}
          style={{ width: '100%', padding: '0.6rem', marginBottom: '1.1rem', borderRadius: 6, border: '1px solid #A79A76' }} />

        <button type="submit" disabled={busy} style={{
          width: '100%', padding: '0.65rem', borderRadius: 7, border: 'none',
          background: '#3E5A38', color: 'white', fontWeight: 600, cursor: 'pointer', marginBottom: '0.8rem',
        }}>
          {busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'}
        </button>

        {msg && <p style={{ fontSize: '0.8rem', color: '#9C3B2E', marginBottom: '0.8rem' }}>{msg}</p>}

        <button type="button" onClick={() => { setMode(m => m === 'login' ? 'signup' : 'login'); setMsg(''); }}
          style={{ background: 'none', border: 'none', color: '#3E5A38', fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline' }}>
          {mode === 'login' ? 'Não tem conta? Criar uma' : 'Já tem conta? Entrar'}
        </button>
      </form>
    </div>
  );
}

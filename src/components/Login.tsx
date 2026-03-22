import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [modo, setModo] = useState<'login' | 'cadastro'>('login')
  const [mensagem, setMensagem] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    setLoading(true)
    setMensagem('')

    if (modo === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
      if (error) setMensagem('Erro: ' + error.message)
    } else {
      const { error } = await supabase.auth.signUp({ email, password: senha })
      if (error) setMensagem('Erro: ' + error.message)
      else setMensagem('Cadastro realizado! Verifique seu e-mail para confirmar.')
    }

    setLoading(false)
  }

  return (
    <div style={{
      width: '100vw', height: '100vh',
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      backgroundColor: '#0f172a'
    }}>
      <div style={{
        backgroundColor: '#1e293b', padding: 40, borderRadius: 12,
        width: 360, border: '1px solid #334155'
      }}>
        <h2 style={{ color: 'white', textAlign: 'center', marginBottom: 24 }}>
          💰 Finance Hub
        </h2>

        <div style={{ display: 'flex', marginBottom: 24, gap: 8 }}>
          {(['login', 'cadastro'] as const).map((m) => (
            <button key={m} onClick={() => setModo(m)} style={{
              flex: 1, padding: '8px 0',
              backgroundColor: modo === m ? '#3b82f6' : '#334155',
              color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer'
            }}>
              {m === 'login' ? 'Entrar' : 'Cadastrar'}
            </button>
          ))}
        </div>

        <input
          type="email" placeholder="E-mail" value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: '100%', padding: 10, marginBottom: 12, borderRadius: 6,
            backgroundColor: '#0f172a', border: '1px solid #334155', color: 'white',
            boxSizing: 'border-box' }}
        />

        <input
          type="password" placeholder="Senha" value={senha}
          onChange={(e) => setSenha(e.target.value)}
          style={{ width: '100%', padding: 10, marginBottom: 16, borderRadius: 6,
            backgroundColor: '#0f172a', border: '1px solid #334155', color: 'white',
            boxSizing: 'border-box' }}
        />

        {mensagem && (
          <p style={{ color: mensagem.startsWith('Erro') ? '#ef4444' : '#22c55e',
            marginBottom: 12, fontSize: 14 }}>{mensagem}</p>
        )}

        <button onClick={handleSubmit} disabled={loading} style={{
          width: '100%', padding: 12, backgroundColor: '#3b82f6',
          color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer',
          fontWeight: 'bold', fontSize: 16
        }}>
          {loading ? 'Aguarde...' : modo === 'login' ? 'Entrar' : 'Criar conta'}
        </button>
      </div>
    </div>
  )
}
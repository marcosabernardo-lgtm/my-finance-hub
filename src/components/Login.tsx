import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

type Modo = 'login' | 'cadastro' | 'esqueci' | 'nova_senha'

export default function Login() {
  const [email, setEmail]       = useState('')
  const [senha, setSenha]       = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [modo, setModo]         = useState<Modo>('login')
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro]         = useState('')
  const [loading, setLoading]   = useState(false)

  // Detecta se veio do link de recuperação de senha
  useEffect(() => {
    const hash = window.location.hash
    if (hash.includes('type=recovery')) {
      setModo('nova_senha')
    }
  }, [])

  const limpar = () => { setMensagem(''); setErro('') }

  const handleLogin = async () => {
    limpar(); setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    if (error) setErro('E-mail ou senha incorretos.')
    setLoading(false)
  }

  const handleCadastro = async () => {
    limpar(); setLoading(true)
    const { error } = await supabase.auth.signUp({ email, password: senha })
    if (error) setErro('Erro: ' + error.message)
    else setMensagem('Cadastro realizado! Verifique seu e-mail para confirmar.')
    setLoading(false)
  }

  const handleEsqueci = async () => {
    limpar(); setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    })
    if (error) setErro('Erro ao enviar e-mail: ' + error.message)
    else setMensagem('E-mail de recuperação enviado! Verifique sua caixa de entrada.')
    setLoading(false)
  }

  const handleNovaSenha = async () => {
    limpar()
    if (novaSenha.length < 6) { setErro('A senha deve ter pelo menos 6 caracteres.'); return }
    if (novaSenha !== confirmar) { setErro('As senhas não coincidem.'); return }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: novaSenha })
    if (error) setErro('Erro ao atualizar senha: ' + error.message)
    else {
      setMensagem('Senha atualizada com sucesso! Você já pode entrar.')
      setTimeout(() => { setModo('login'); window.location.hash = '' }, 2500)
    }
    setLoading(false)
  }

  const inputStyle = {
    width: '100%', padding: 10, borderRadius: 6,
    backgroundColor: '#0f172a', border: '1px solid #334155',
    color: 'white', boxSizing: 'border-box' as const,
    fontSize: 14, outline: 'none',
  }

  const btnPrimary = {
    width: '100%', padding: 12, backgroundColor: '#3b82f6',
    color: 'white', border: 'none', borderRadius: 6,
    cursor: 'pointer', fontWeight: 'bold' as const, fontSize: 16,
  }

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' }}>
      <div style={{ backgroundColor: '#1e293b', padding: 40, borderRadius: 12, width: 360, border: '1px solid #334155' }}>

        <h2 style={{ color: 'white', textAlign: 'center', marginBottom: 24, fontSize: 22 }}>
          💰 Finance Hub
        </h2>

        {/* ── Tabs login/cadastro ────────────────────────────────────── */}
        {(modo === 'login' || modo === 'cadastro') && (
          <div style={{ display: 'flex', marginBottom: 24, gap: 8 }}>
            {(['login', 'cadastro'] as const).map(m => (
              <button key={m} onClick={() => { setModo(m); limpar() }} style={{
                flex: 1, padding: '8px 0',
                backgroundColor: modo === m ? '#3b82f6' : '#334155',
                color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: modo === m ? 600 : 400,
              }}>
                {m === 'login' ? 'Entrar' : 'Cadastrar'}
              </button>
            ))}
          </div>
        )}

        {/* ── Login ─────────────────────────────────────────────────── */}
        {modo === 'login' && (
          <>
            <input type="email" placeholder="E-mail" value={email} onChange={e => setEmail(e.target.value)}
              style={{ ...inputStyle, marginBottom: 12 }} />
            <input type="password" placeholder="Senha" value={senha} onChange={e => setSenha(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              style={{ ...inputStyle, marginBottom: 8 }} />
            <div style={{ textAlign: 'right', marginBottom: 16 }}>
              <span onClick={() => { setModo('esqueci'); limpar() }} style={{ fontSize: 12, color: '#60a5fa', cursor: 'pointer', textDecoration: 'underline' }}>
                Esqueceu a senha?
              </span>
            </div>
            {erro && <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{erro}</p>}
            <button onClick={handleLogin} disabled={loading} style={btnPrimary}>
              {loading ? 'Aguarde...' : 'Entrar'}
            </button>
          </>
        )}

        {/* ── Cadastro ──────────────────────────────────────────────── */}
        {modo === 'cadastro' && (
          <>
            <input type="email" placeholder="E-mail" value={email} onChange={e => setEmail(e.target.value)}
              style={{ ...inputStyle, marginBottom: 12 }} />
            <input type="password" placeholder="Senha (mín. 6 caracteres)" value={senha} onChange={e => setSenha(e.target.value)}
              style={{ ...inputStyle, marginBottom: 16 }} />
            {erro     && <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{erro}</p>}
            {mensagem && <p style={{ color: '#22c55e', fontSize: 13, marginBottom: 12 }}>{mensagem}</p>}
            <button onClick={handleCadastro} disabled={loading} style={btnPrimary}>
              {loading ? 'Aguarde...' : 'Criar conta'}
            </button>
          </>
        )}

        {/* ── Esqueci a senha ───────────────────────────────────────── */}
        {modo === 'esqueci' && (
          <>
            <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
              Digite seu e-mail e enviaremos um link para você criar uma nova senha.
            </p>
            <input type="email" placeholder="E-mail" value={email} onChange={e => setEmail(e.target.value)}
              style={{ ...inputStyle, marginBottom: 16 }} />
            {erro     && <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{erro}</p>}
            {mensagem && <p style={{ color: '#22c55e', fontSize: 13, marginBottom: 12 }}>{mensagem}</p>}
            <button onClick={handleEsqueci} disabled={loading} style={{ ...btnPrimary, marginBottom: 12 }}>
              {loading ? 'Enviando...' : 'Enviar link de recuperação'}
            </button>
            <button onClick={() => { setModo('login'); limpar() }} style={{ width: '100%', padding: 10, background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
              ← Voltar para o login
            </button>
          </>
        )}

        {/* ── Nova senha (vindo do link de e-mail) ──────────────────── */}
        {modo === 'nova_senha' && (
          <>
            <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
              Digite sua nova senha abaixo.
            </p>
            <input type="password" placeholder="Nova senha" value={novaSenha} onChange={e => setNovaSenha(e.target.value)}
              style={{ ...inputStyle, marginBottom: 12 }} />
            <input type="password" placeholder="Confirmar nova senha" value={confirmar} onChange={e => setConfirmar(e.target.value)}
              style={{ ...inputStyle, marginBottom: 16 }} />
            {erro     && <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{erro}</p>}
            {mensagem && <p style={{ color: '#22c55e', fontSize: 13, marginBottom: 12 }}>{mensagem}</p>}
            <button onClick={handleNovaSenha} disabled={loading} style={btnPrimary}>
              {loading ? 'Salvando...' : 'Salvar nova senha'}
            </button>
          </>
        )}

      </div>
    </div>
  )
}

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

const HOUSEHOLD_ID = 'fdfc5a94-c5e4-42d1-b1c2-015dfa492556';

interface Config {
  id?: string;
  whatsapp_number: string;
  ativo: boolean;
}

export default function NotificacoesConfig() {
  const [config, setConfig] = useState<Config>({ whatsapp_number: '', ativo: true });
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);
  const [darkMode] = useState(() => localStorage.getItem('darkMode') === 'true');

  const cores = {
    bg: darkMode ? '#1a1a2e' : '#f5f7fa',
    card: darkMode ? '#16213e' : '#ffffff',
    texto: darkMode ? '#e2e8f0' : '#1a202c',
    subtexto: darkMode ? '#94a3b8' : '#718096',
    borda: darkMode ? '#2d3748' : '#e2e8f0',
    primaria: '#667eea',
    sucesso: '#48bb78',
    erro: '#fc8181',
    input: darkMode ? '#2d3748' : '#f7fafc',
  };

  useEffect(() => {
    carregarConfig();
  }, []);

  async function carregarConfig() {
    setLoading(true);
    const { data } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('household_id', HOUSEHOLD_ID)
      .single();

    if (data) {
      setConfig({ id: data.id, whatsapp_number: data.whatsapp_number, ativo: data.ativo });
    }
    setLoading(false);
  }

  function formatarNumero(valor: string): string {
    // Remove tudo que não for dígito
    return valor.replace(/\D/g, '');
  }

  function numeroValido(numero: string): boolean {
    // Deve ter 12 ou 13 dígitos: 55 + DDD (2) + número (8 ou 9)
    return /^55\d{10,11}$/.test(numero);
  }

  async function salvar() {
    if (!numeroValido(config.whatsapp_number)) {
      setMensagem({ tipo: 'erro', texto: 'Número inválido. Use o formato: 5511999999999 (com 55 + DDD + número)' });
      return;
    }

    setSalvando(true);
    setMensagem(null);

    const payload = {
      household_id: HOUSEHOLD_ID,
      whatsapp_number: config.whatsapp_number,
      ativo: config.ativo,
      updated_at: new Date().toISOString(),
    };

    let error;
    if (config.id) {
      ({ error } = await supabase.from('notification_settings').update(payload).eq('id', config.id));
    } else {
      const res = await supabase.from('notification_settings').insert(payload).select().single();
      error = res.error;
      if (res.data) setConfig(prev => ({ ...prev, id: res.data.id }));
    }

    if (error) {
      setMensagem({ tipo: 'erro', texto: 'Erro ao salvar: ' + error.message });
    } else {
      setMensagem({ tipo: 'sucesso', texto: 'Configuração salva com sucesso! ✅' });
    }
    setSalvando(false);
  }

  async function testarAgora() {
    if (!config.id) {
      setMensagem({ tipo: 'erro', texto: 'Salve a configuração antes de testar.' });
      return;
    }
    if (!numeroValido(config.whatsapp_number)) {
      setMensagem({ tipo: 'erro', texto: 'Número inválido.' });
      return;
    }

    setTestando(true);
    setMensagem(null);

    try {
      const res = await fetch('https://wmvujvyutvwojecwmruy.supabase.co/functions/v1/daily-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdnVqdnl1dHZ3b2plY3dtcnV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMDEwMDgsImV4cCI6MjA4OTY3NzAwOH0.udql_zBepK2fzAxaGcsNsLavZuUSG7vefqSrVT8bABA`,
        },
        body: JSON.stringify({}),
      });

      if (res.ok) {
        setMensagem({ tipo: 'sucesso', texto: 'Mensagem de teste enviada! Verifique seu WhatsApp. 📱' });
      } else {
        const err = await res.text();
        setMensagem({ tipo: 'erro', texto: 'Erro ao enviar teste: ' + err });
      }
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: 'Erro de conexão com a Edge Function.' });
    }

    setTestando(false);
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
        <p style={{ color: cores.subtexto }}>Carregando...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '600px', margin: '0 auto' }}>
      {/* Cabeçalho */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: cores.texto, margin: '0 0 8px 0' }}>
          🔔 Notificações WhatsApp
        </h1>
        <p style={{ color: cores.subtexto, margin: 0, fontSize: '14px' }}>
          Receba um resumo diário com saldos e alertas todo dia às <strong>8h da manhã</strong>.
        </p>
      </div>

      {/* Card principal */}
      <div style={{
        background: cores.card,
        borderRadius: '16px',
        padding: '28px',
        border: `1px solid ${cores.borda}`,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}>

        {/* Ativar/Desativar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
          paddingBottom: '24px',
          borderBottom: `1px solid ${cores.borda}`,
        }}>
          <div>
            <p style={{ margin: '0 0 4px 0', fontWeight: '600', color: cores.texto }}>Notificações ativas</p>
            <p style={{ margin: 0, fontSize: '13px', color: cores.subtexto }}>
              {config.ativo ? 'Você receberá mensagens diárias' : 'Notificações pausadas'}
            </p>
          </div>
          <button
            onClick={() => setConfig(prev => ({ ...prev, ativo: !prev.ativo }))}
            style={{
              width: '52px',
              height: '28px',
              borderRadius: '14px',
              border: 'none',
              cursor: 'pointer',
              background: config.ativo ? cores.primaria : cores.borda,
              position: 'relative',
              transition: 'background 0.2s',
            }}
          >
            <span style={{
              position: 'absolute',
              top: '3px',
              left: config.ativo ? '27px' : '3px',
              width: '22px',
              height: '22px',
              borderRadius: '50%',
              background: '#fff',
              transition: 'left 0.2s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }} />
          </button>
        </div>

        {/* Número WhatsApp */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{
            display: 'block',
            marginBottom: '8px',
            fontWeight: '600',
            fontSize: '14px',
            color: cores.texto,
          }}>
            Número do WhatsApp
          </label>
          <input
            type="tel"
            placeholder="5511999999999"
            value={config.whatsapp_number}
            onChange={e => setConfig(prev => ({ ...prev, whatsapp_number: formatarNumero(e.target.value) }))}
            maxLength={13}
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: '10px',
              border: `1px solid ${cores.borda}`,
              background: cores.input,
              color: cores.texto,
              fontSize: '16px',
              outline: 'none',
              boxSizing: 'border-box',
              fontFamily: 'monospace',
            }}
          />
          <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: cores.subtexto }}>
            Formato: <strong>55</strong> (país) + <strong>DDD</strong> + <strong>número</strong>. Ex: 5541999887766
          </p>
        </div>

        {/* Preview do que será enviado */}
        <div style={{
          background: darkMode ? '#0d1b2a' : '#f0f4ff',
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '24px',
        }}>
          <p style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: '600', color: cores.primaria }}>
            📋 Exemplo de mensagem
          </p>
          <pre style={{
            margin: 0,
            fontSize: '12px',
            color: cores.subtexto,
            whiteSpace: 'pre-wrap',
            fontFamily: 'inherit',
            lineHeight: '1.6',
          }}>{`📊 Resumo Financeiro - 03/04/2026

💰 Saldos das Contas
Contas Correntes:
🟢 Nubank: R$ 1.250,00
🔴 C6 Bank: -R$ 120,00

⚠️ Vencem nos próximos 5 dias (2)
• Aluguel — R$ 1.800,00 (05/04)
• Internet — R$ 99,90 (07/04)

✅ Nenhum alerta no momento!

Enviado automaticamente pelo my-finance-hub 🚀`}</pre>
        </div>

        {/* Mensagem de feedback */}
        {mensagem && (
          <div style={{
            padding: '12px 16px',
            borderRadius: '10px',
            marginBottom: '16px',
            background: mensagem.tipo === 'sucesso'
              ? (darkMode ? '#1a3a2a' : '#f0fff4')
              : (darkMode ? '#3a1a1a' : '#fff5f5'),
            border: `1px solid ${mensagem.tipo === 'sucesso' ? cores.sucesso : cores.erro}`,
            color: mensagem.tipo === 'sucesso' ? cores.sucesso : cores.erro,
            fontSize: '14px',
          }}>
            {mensagem.texto}
          </div>
        )}

        {/* Botões */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={salvar}
            disabled={salvando}
            style={{
              flex: 1,
              padding: '14px',
              borderRadius: '10px',
              border: 'none',
              background: cores.primaria,
              color: '#fff',
              fontWeight: '600',
              fontSize: '15px',
              cursor: salvando ? 'not-allowed' : 'pointer',
              opacity: salvando ? 0.7 : 1,
            }}
          >
            {salvando ? 'Salvando...' : '💾 Salvar'}
          </button>

          <button
            onClick={testarAgora}
            disabled={testando || !config.id}
            style={{
              flex: 1,
              padding: '14px',
              borderRadius: '10px',
              border: `2px solid ${cores.primaria}`,
              background: 'transparent',
              color: cores.primaria,
              fontWeight: '600',
              fontSize: '15px',
              cursor: (testando || !config.id) ? 'not-allowed' : 'pointer',
              opacity: (testando || !config.id) ? 0.6 : 1,
            }}
          >
            {testando ? 'Enviando...' : '📱 Testar agora'}
          </button>
        </div>
      </div>

      {/* Info horário */}
      <div style={{
        marginTop: '20px',
        padding: '16px',
        borderRadius: '12px',
        background: darkMode ? '#1a2744' : '#eff6ff',
        border: `1px solid ${darkMode ? '#2d4a8a' : '#bfdbfe'}`,
      }}>
        <p style={{ margin: 0, fontSize: '13px', color: darkMode ? '#93c5fd' : '#3b82f6' }}>
          🕗 A mensagem é enviada automaticamente todo dia às <strong>8h00 (horário de Brasília)</strong>.
          Use o botão "Testar agora" para receber uma prévia imediata.
        </p>
      </div>
    </div>
  );
}

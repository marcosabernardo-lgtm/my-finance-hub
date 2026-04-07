import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://wmvujvyutvwojecwmruy.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdnVqdnl1dHZ3b2plY3dtcnV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMDEwMDgsImV4cCI6MjA4OTY3NzAwOH0.udql_zBepK2fzAxaGcsNsLavZuUSG7vefqSrVT8bABA'
);

const HOUSEHOLD_ID = 'fdfc5a94-c5e4-42d1-b1c2-015dfa492556';

interface Movimentacao {
  id: string;
  descricao: string;
  valor: number;
  data_movimentacao: string;
  data_pagamento: string;
  tipo: string;
  metodo_pagamento: string;
  situacao: string;
  numero_parcela: string;
  grupo_id: string;
  cartao_id: string | null;
  conta_origem_destino: string | null;
  categoria_id: string | null;
  categorias?: { nome: string };
  cartoes?: { nome: string };
}

interface Divida {
  grupo_id: string;
  descricao: string;
  metodo_pagamento: string;
  cartao_nome: string | null;
  conta_nome: string | null;
  categoria_nome: string | null;
  total_parcelas: number;
  parcelas_pagas: number;
  parcelas_pendentes: number;
  valor_parcela: number;
  valor_total: number;
  valor_pago: number;
  valor_restante: number;
  proxima_parcela: string;
  ultima_parcela: string;
  parcelas: Movimentacao[];
}

interface CartaoOpcao {
  id: string;
  nome: string;
}

interface ContaOpcao {
  id: string;
  nome: string;
}

const CORES = {
  credito: '#e05252',
  debito: '#4a9eff',
  quitado: '#52c878',
  pendente: '#f5a623',
  fundo: '#f8fafc',
  sidebar: '#0d7280',
  texto: '#1a2332',
  textoSecundario: '#6b7a8d',
  borda: '#e2e8f0',
  card: '#ffffff',
  cardHover: '#f0f9ff',
};

function formatMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatData(data: string): string {
  if (!data) return '-';
  const d = new Date(data + 'T00:00:00');
  return d.toLocaleDateString('pt-BR');
}

function getMesAno(data: string): string {
  const d = new Date(data + 'T00:00:00');
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function parseParcela(numero_parcela: string): { atual: number; total: number } {
  if (!numero_parcela) return { atual: 0, total: 0 };
  const match = numero_parcela.match(/Parcela (\d+)\/(\d+)/i);
  if (!match) return { atual: 0, total: 0 };
  return { atual: parseInt(match[1]), total: parseInt(match[2]) };
}

export default function Endividamento() {
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [cartoes, setCartoes] = useState<CartaoOpcao[]>([]);
  const [contas, setContas] = useState<ContaOpcao[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroCartao, setFiltroCartao] = useState('');
  const [filtroConta, setFiltroConta] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'credito' | 'debito'>('todos');
  const [dividaExpandida, setDividaExpandida] = useState<string | null>(null);
  const [abaEvolucao, setAbaEvolucao] = useState(false);

  useEffect(() => {
    carregarDados();
  }, []);

  async function carregarDados() {
    setLoading(true);
    try {
      const [movRes, cartRes, contRes] = await Promise.all([
        supabase
          .from('movimentacoes')
          .select('*, categorias(nome), cartoes(nome)')
          .eq('household_id', HOUSEHOLD_ID)
          .eq('tipo', 'Despesa')
          .not('numero_parcela', 'is', null)
          .not('grupo_id', 'is', null)
          .order('data_pagamento', { ascending: true }),
        supabase.from('cartoes').select('id, nome').eq('ativo', true),
        supabase.from('contas').select('id, nome').eq('ativo', true).eq('tipo', 'corrente'),
      ]);

      if (movRes.data) {
        // Filtra apenas parcelados com mais de 1 parcela
        const parceladas = movRes.data.filter((m) => {
          const { total } = parseParcela(m.numero_parcela);
          return total > 1;
        });
        setMovimentacoes(parceladas);
      }
      if (cartRes.data) setCartoes(cartRes.data);
      if (contRes.data) setContas(contRes.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  const dividas = useMemo<Divida[]>(() => {
    const grupos: Record<string, Movimentacao[]> = {};
    for (const m of movimentacoes) {
      if (!m.grupo_id) continue;
      if (!grupos[m.grupo_id]) grupos[m.grupo_id] = [];
      grupos[m.grupo_id].push(m);
    }

    return Object.entries(grupos)
      .map(([grupo_id, parcelas]) => {
        parcelas.sort((a, b) => {
          const pa = parseParcela(a.numero_parcela).atual;
          const pb = parseParcela(b.numero_parcela).atual;
          return pa - pb;
        });
        const primeiraP = parcelas[0];
        const { total } = parseParcela(primeiraP.numero_parcela);
        const pagas = parcelas.filter((p) => p.situacao === 'Pago').length;
        const pendentes = parcelas.filter((p) => p.situacao !== 'Pago').length;
        const valorParcela = primeiraP.valor;
        const valorTotal = valorParcela * total;
        const valorPago = valorParcela * pagas;
        const valorRestante = valorParcela * pendentes;
        const pendentesOrdenadas = parcelas
          .filter((p) => p.situacao !== 'Pago')
          .sort((a, b) =>
            (a.data_pagamento || '').localeCompare(b.data_pagamento || '')
          );
        const proximaParcela = pendentesOrdenadas[0]?.data_pagamento || '';
        const ultimaParcela = pendentesOrdenadas[pendentesOrdenadas.length - 1]?.data_pagamento || '';

        return {
          grupo_id,
          descricao: primeiraP.descricao,
          metodo_pagamento: primeiraP.metodo_pagamento,
          cartao_nome: (primeiraP as any).cartoes?.nome || null,
          conta_nome: primeiraP.conta_origem_destino || null,
          categoria_nome: (primeiraP as any).categorias?.nome || null,
          total_parcelas: total,
          parcelas_pagas: pagas,
          parcelas_pendentes: pendentes,
          valor_parcela: valorParcela,
          valor_total: valorTotal,
          valor_pago: valorPago,
          valor_restante: valorRestante,
          proxima_parcela: proximaParcela,
          ultima_parcela: ultimaParcela,
          parcelas,
        };
      })
      .filter((d) => d.parcelas_pendentes > 0); // Só dívidas ativas
  }, [movimentacoes]);

  const dividasFiltradas = useMemo(() => {
    return dividas.filter((d) => {
      if (filtroTipo === 'credito' && d.metodo_pagamento !== 'Crédito') return false;
      if (filtroTipo === 'debito' && d.metodo_pagamento === 'Crédito') return false;
      if (filtroCartao && d.cartao_nome !== filtroCartao) return false;
      if (filtroConta && d.conta_nome !== filtroConta) return false;
      return true;
    });
  }, [dividas, filtroTipo, filtroCartao, filtroConta]);

  const totalDividas = useMemo(() => {
    const credito = dividasFiltradas
      .filter((d) => d.metodo_pagamento === 'Crédito')
      .reduce((s, d) => s + d.valor_restante, 0);
    const debito = dividasFiltradas
      .filter((d) => d.metodo_pagamento !== 'Crédito')
      .reduce((s, d) => s + d.valor_restante, 0);
    return { credito, debito, total: credito + debito };
  }, [dividasFiltradas]);

  // Evolução mês a mês: saldo devedor restante por mês
  const evolucaoMensal = useMemo(() => {
    const meses: Record<string, { restante: number; pago: number }> = {};
    for (const d of dividasFiltradas) {
      for (const p of d.parcelas) {
        const mes = getMesAno(p.data_pagamento);
        if (!meses[mes]) meses[mes] = { restante: 0, pago: 0 };
        if (p.situacao === 'Pago') {
          meses[mes].pago += p.valor;
        } else {
          meses[mes].restante += p.valor;
        }
      }
    }
    return Object.entries(meses)
      .sort(([a], [b]) => {
        const [ma, ya] = a.split('/');
        const [mb, yb] = b.split('/');
        return new Date(parseInt(ya), parseInt(ma) - 1).getTime() -
          new Date(parseInt(yb), parseInt(mb) - 1).getTime();
      })
      .map(([mes, vals]) => ({ mes, ...vals }));
  }, [dividasFiltradas]);

  const maxEvolucao = Math.max(...evolucaoMensal.map((e) => e.restante + e.pago), 1);

  const estilos = {
    container: {
      padding: '24px',
      backgroundColor: CORES.fundo,
      minHeight: '100vh',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
    } as React.CSSProperties,
    titulo: {
      fontSize: '24px',
      fontWeight: 700,
      color: CORES.texto,
      marginBottom: '4px',
    } as React.CSSProperties,
    subtitulo: {
      fontSize: '14px',
      color: CORES.textoSecundario,
      marginBottom: '24px',
    } as React.CSSProperties,
    cards3col: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: '16px',
      marginBottom: '24px',
    } as React.CSSProperties,
    card: {
      backgroundColor: CORES.card,
      border: `1px solid ${CORES.borda}`,
      borderRadius: '12px',
      padding: '20px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    } as React.CSSProperties,
    cardLabel: {
      fontSize: '12px',
      fontWeight: 600,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.5px',
      color: CORES.textoSecundario,
      marginBottom: '8px',
    },
    cardValor: (cor: string) => ({
      fontSize: '28px',
      fontWeight: 800,
      color: cor,
      lineHeight: 1.2,
    } as React.CSSProperties),
    cardSub: {
      fontSize: '12px',
      color: CORES.textoSecundario,
      marginTop: '4px',
    } as React.CSSProperties,
    filtrosRow: {
      display: 'flex',
      gap: '12px',
      marginBottom: '20px',
      flexWrap: 'wrap' as const,
      alignItems: 'center',
    } as React.CSSProperties,
    select: {
      padding: '8px 12px',
      borderRadius: '8px',
      border: `1px solid ${CORES.borda}`,
      backgroundColor: CORES.card,
      color: CORES.texto,
      fontSize: '14px',
      cursor: 'pointer',
      outline: 'none',
      minWidth: '160px',
    } as React.CSSProperties,
    btnFiltro: (ativo: boolean) => ({
      padding: '8px 16px',
      borderRadius: '8px',
      border: `1.5px solid ${ativo ? CORES.sidebar : CORES.borda}`,
      backgroundColor: ativo ? CORES.sidebar : CORES.card,
      color: ativo ? '#fff' : CORES.texto,
      fontSize: '13px',
      fontWeight: 600,
      cursor: 'pointer',
      transition: 'all 0.15s',
    } as React.CSSProperties),
    abasRow: {
      display: 'flex',
      gap: '8px',
      marginBottom: '20px',
      borderBottom: `2px solid ${CORES.borda}`,
      paddingBottom: '0',
    } as React.CSSProperties,
    aba: (ativo: boolean) => ({
      padding: '10px 20px',
      fontSize: '14px',
      fontWeight: 600,
      cursor: 'pointer',
      border: 'none',
      background: 'none',
      color: ativo ? CORES.sidebar : CORES.textoSecundario,
      borderBottom: `2px solid ${ativo ? CORES.sidebar : 'transparent'}`,
      marginBottom: '-2px',
    } as React.CSSProperties),
    tabelaContainer: {
      backgroundColor: CORES.card,
      border: `1px solid ${CORES.borda}`,
      borderRadius: '12px',
      overflow: 'hidden',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    } as React.CSSProperties,
    thRow: {
      display: 'grid',
      gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr 80px',
      padding: '12px 20px',
      backgroundColor: '#f1f5f9',
      borderBottom: `1px solid ${CORES.borda}`,
    } as React.CSSProperties,
    th: {
      fontSize: '11px',
      fontWeight: 700,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.5px',
      color: CORES.textoSecundario,
    } as React.CSSProperties,
    dividaRow: (hover: boolean) => ({
      display: 'grid',
      gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr 80px',
      padding: '14px 20px',
      borderBottom: `1px solid ${CORES.borda}`,
      cursor: 'pointer',
      backgroundColor: hover ? CORES.cardHover : CORES.card,
      transition: 'background 0.12s',
      alignItems: 'center',
    } as React.CSSProperties),
    badge: (metodo: string) => ({
      display: 'inline-flex',
      alignItems: 'center',
      padding: '3px 10px',
      borderRadius: '20px',
      fontSize: '11px',
      fontWeight: 700,
      backgroundColor:
        metodo === 'Crédito'
          ? '#fce8e8'
          : metodo === 'Débito'
          ? '#e8f0fe'
          : '#e8faf0',
      color:
        metodo === 'Crédito'
          ? CORES.credito
          : metodo === 'Débito'
          ? CORES.debito
          : '#2d8a55',
    } as React.CSSProperties),
    progressoBar: (pct: number, cor: string) => ({
      width: '100%',
      height: '6px',
      backgroundColor: '#e9ecef',
      borderRadius: '3px',
      overflow: 'hidden' as const,
      marginTop: '4px',
    }),
    progressoFill: (pct: number, cor: string) => ({
      width: `${Math.min(100, pct)}%`,
      height: '100%',
      backgroundColor: cor,
      borderRadius: '3px',
      transition: 'width 0.4s ease',
    } as React.CSSProperties),
    drillDown: {
      backgroundColor: '#f8fafc',
      borderBottom: `1px solid ${CORES.borda}`,
      padding: '16px 20px 20px',
    } as React.CSSProperties,
    drillTitle: {
      fontSize: '13px',
      fontWeight: 700,
      color: CORES.texto,
      marginBottom: '12px',
    } as React.CSSProperties,
    drillGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
      gap: '8px',
    } as React.CSSProperties,
    parcelaCard: (situacao: string) => ({
      backgroundColor: situacao === 'Pago' ? '#f0fdf4' : '#fff',
      border: `1px solid ${situacao === 'Pago' ? '#86efac' : CORES.borda}`,
      borderRadius: '8px',
      padding: '10px 12px',
    } as React.CSSProperties),
    parcelaBadge: (situacao: string) => ({
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: '12px',
      fontSize: '10px',
      fontWeight: 700,
      backgroundColor: situacao === 'Pago' ? '#dcfce7' : '#fef3c7',
      color: situacao === 'Pago' ? '#16a34a' : '#d97706',
      marginBottom: '4px',
    } as React.CSSProperties),
    evolucaoContainer: {
      backgroundColor: CORES.card,
      border: `1px solid ${CORES.borda}`,
      borderRadius: '12px',
      padding: '24px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    } as React.CSSProperties,
    barraEvolucao: {
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      gap: '6px',
      flex: 1,
      minWidth: '60px',
    } as React.CSSProperties,
    semDados: {
      textAlign: 'center' as const,
      padding: '60px 20px',
      color: CORES.textoSecundario,
      fontSize: '15px',
    } as React.CSSProperties,
  };

  const [hoverId, setHoverId] = useState<string | null>(null);

  if (loading) {
    return (
      <div style={{ ...estilos.container, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: CORES.textoSecundario, fontSize: '16px' }}>Carregando endividamento...</div>
      </div>
    );
  }

  return (
    <div style={estilos.container}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div>
          <h1 style={estilos.titulo}>Endividamento</h1>
          <p style={estilos.subtitulo}>Acompanhe seus parcelamentos ativos e evolução do saldo devedor</p>
        </div>
        <button
          onClick={carregarDados}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: `1px solid ${CORES.borda}`,
            backgroundColor: CORES.card,
            color: CORES.texto,
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          ↻ Atualizar
        </button>
      </div>

      {/* Cards resumo */}
      <div style={estilos.cards3col}>
        <div style={estilos.card}>
          <div style={estilos.cardLabel}>Total em Dívidas</div>
          <div style={estilos.cardValor(CORES.texto)}>{formatMoeda(totalDividas.total)}</div>
          <div style={estilos.cardSub}>{dividasFiltradas.length} parcelamento(s) ativo(s)</div>
        </div>
        <div style={{ ...estilos.card, borderLeft: `4px solid ${CORES.credito}` }}>
          <div style={estilos.cardLabel}>Crédito Parcelado</div>
          <div style={estilos.cardValor(CORES.credito)}>{formatMoeda(totalDividas.credito)}</div>
          <div style={estilos.cardSub}>
            {dividasFiltradas.filter((d) => d.metodo_pagamento === 'Crédito').length} dívida(s)
          </div>
        </div>
        <div style={{ ...estilos.card, borderLeft: `4px solid ${CORES.debito}` }}>
          <div style={estilos.cardLabel}>Débito / PIX</div>
          <div style={estilos.cardValor(CORES.debito)}>{formatMoeda(totalDividas.debito)}</div>
          <div style={estilos.cardSub}>
            {dividasFiltradas.filter((d) => d.metodo_pagamento !== 'Crédito').length} dívida(s)
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div style={estilos.filtrosRow}>
        <div style={{ display: 'flex', gap: '8px' }}>
          {(['todos', 'credito', 'debito'] as const).map((tipo) => (
            <button
              key={tipo}
              style={estilos.btnFiltro(filtroTipo === tipo)}
              onClick={() => setFiltroTipo(tipo)}
            >
              {tipo === 'todos' ? 'Todos' : tipo === 'credito' ? '💳 Crédito' : '🏦 Débito/PIX'}
            </button>
          ))}
        </div>
        <select
          style={estilos.select}
          value={filtroCartao}
          onChange={(e) => { setFiltroCartao(e.target.value); setFiltroConta(''); }}
        >
          <option value="">Todos os cartões</option>
          {cartoes.map((c) => (
            <option key={c.id} value={c.nome}>{c.nome}</option>
          ))}
        </select>
        <select
          style={estilos.select}
          value={filtroConta}
          onChange={(e) => { setFiltroConta(e.target.value); setFiltroCartao(''); }}
        >
          <option value="">Todas as contas</option>
          {contas.map((c) => (
            <option key={c.id} value={c.nome}>{c.nome}</option>
          ))}
        </select>
        {(filtroCartao || filtroConta || filtroTipo !== 'todos') && (
          <button
            style={{ ...estilos.btnFiltro(false), color: CORES.credito, borderColor: CORES.credito }}
            onClick={() => { setFiltroCartao(''); setFiltroConta(''); setFiltroTipo('todos'); }}
          >
            ✕ Limpar filtros
          </button>
        )}
      </div>

      {/* Abas */}
      <div style={estilos.abasRow}>
        <button style={estilos.aba(!abaEvolucao)} onClick={() => setAbaEvolucao(false)}>
          📋 Dívidas Ativas
        </button>
        <button style={estilos.aba(abaEvolucao)} onClick={() => setAbaEvolucao(true)}>
          📈 Evolução Mensal
        </button>
      </div>

      {/* Aba: Dívidas Ativas */}
      {!abaEvolucao && (
        <>
          {dividasFiltradas.length === 0 ? (
            <div style={estilos.semDados}>
              🎉 Nenhuma dívida ativa encontrada para os filtros selecionados.
            </div>
          ) : (
            <div style={estilos.tabelaContainer}>
              {/* Cabeçalho da tabela */}
              <div style={estilos.thRow}>
                <div style={estilos.th}>Descrição</div>
                <div style={estilos.th}>Método</div>
                <div style={estilos.th}>Parcelas</div>
                <div style={estilos.th}>Valor Parcela</div>
                <div style={estilos.th}>Restante</div>
                <div style={estilos.th}>Quitação Prev.</div>
                <div style={estilos.th}>Detalhes</div>
              </div>

              {dividasFiltradas.map((d) => {
                const pct = (d.parcelas_pagas / d.total_parcelas) * 100;
                const corBarra = d.metodo_pagamento === 'Crédito' ? CORES.credito : CORES.debito;
                const expandido = dividaExpandida === d.grupo_id;
                const hovered = hoverId === d.grupo_id;

                return (
                  <div key={d.grupo_id}>
                    {/* Linha da dívida */}
                    <div
                      style={estilos.dividaRow(hovered)}
                      onClick={() => setDividaExpandida(expandido ? null : d.grupo_id)}
                      onMouseEnter={() => setHoverId(d.grupo_id)}
                      onMouseLeave={() => setHoverId(null)}
                    >
                      {/* Descrição */}
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: CORES.texto }}>
                          {d.descricao}
                        </div>
                        {d.categoria_nome && (
                          <div style={{ fontSize: '11px', color: CORES.textoSecundario, marginTop: '2px' }}>
                            {d.categoria_nome}
                          </div>
                        )}
                        {(d.cartao_nome || d.conta_nome) && (
                          <div style={{ fontSize: '11px', color: CORES.textoSecundario }}>
                            {d.cartao_nome || d.conta_nome}
                          </div>
                        )}
                      </div>

                      {/* Método */}
                      <div>
                        <span style={estilos.badge(d.metodo_pagamento)}>
                          {d.metodo_pagamento}
                        </span>
                      </div>

                      {/* Parcelas + barra progresso */}
                      <div>
                        <div style={{ fontSize: '13px', color: CORES.texto, fontWeight: 600 }}>
                          {d.parcelas_pagas}/{d.total_parcelas}
                        </div>
                        <div style={estilos.progressoBar(pct, corBarra)}>
                          <div style={estilos.progressoFill(pct, corBarra)} />
                        </div>
                        <div style={{ fontSize: '10px', color: CORES.textoSecundario, marginTop: '2px' }}>
                          {pct.toFixed(0)}% pago
                        </div>
                      </div>

                      {/* Valor parcela */}
                      <div style={{ fontSize: '14px', fontWeight: 600, color: CORES.texto }}>
                        {formatMoeda(d.valor_parcela)}
                      </div>

                      {/* Restante */}
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: CORES.credito }}>
                          {formatMoeda(d.valor_restante)}
                        </div>
                        <div style={{ fontSize: '10px', color: CORES.textoSecundario }}>
                          de {formatMoeda(d.valor_total)}
                        </div>
                      </div>

                      {/* Previsão quitação */}
                      <div>
                        <div style={{ fontSize: '13px', color: CORES.texto, fontWeight: 600 }}>
                          {d.ultima_parcela ? formatData(d.ultima_parcela) : '-'}
                        </div>
                        {d.proxima_parcela && (
                          <div style={{ fontSize: '10px', color: CORES.textoSecundario }}>
                            Próxima: {formatData(d.proxima_parcela)}
                          </div>
                        )}
                      </div>

                      {/* Botão expand */}
                      <div style={{ textAlign: 'center' as const }}>
                        <span style={{
                          display: 'inline-block',
                          width: '28px',
                          height: '28px',
                          lineHeight: '28px',
                          borderRadius: '50%',
                          backgroundColor: expandido ? CORES.sidebar : '#e2e8f0',
                          color: expandido ? '#fff' : CORES.textoSecundario,
                          fontSize: '14px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          userSelect: 'none',
                          transition: 'all 0.15s',
                        }}>
                          {expandido ? '▲' : '▼'}
                        </span>
                      </div>
                    </div>

                    {/* Drill-down: parcelas */}
                    {expandido && (
                      <div style={estilos.drillDown}>
                        <div style={estilos.drillTitle}>
                          Todas as parcelas — {d.descricao}
                          <span style={{ fontWeight: 400, color: CORES.textoSecundario, marginLeft: '8px' }}>
                            ({d.total_parcelas} parcela{d.total_parcelas > 1 ? 's' : ''})
                          </span>
                        </div>
                        <div style={estilos.drillGrid}>
                          {d.parcelas.map((p) => {
                            const { atual, total } = parseParcela(p.numero_parcela);
                            return (
                              <div key={p.id} style={estilos.parcelaCard(p.situacao)}>
                                <div style={estilos.parcelaBadge(p.situacao)}>
                                  {p.situacao}
                                </div>
                                <div style={{ fontSize: '12px', fontWeight: 700, color: CORES.texto }}>
                                  Parcela {atual}/{total}
                                </div>
                                <div style={{ fontSize: '13px', fontWeight: 800, color: CORES.texto, marginTop: '2px' }}>
                                  {formatMoeda(p.valor)}
                                </div>
                                <div style={{ fontSize: '11px', color: CORES.textoSecundario, marginTop: '2px' }}>
                                  Venc: {formatData(p.data_pagamento)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Aba: Evolução Mensal */}
      {abaEvolucao && (
        <div style={estilos.evolucaoContainer}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: CORES.texto, marginBottom: '20px' }}>
            Comprometimento mensal por parcelamentos
          </div>

          {evolucaoMensal.length === 0 ? (
            <div style={estilos.semDados}>Sem dados para exibir.</div>
          ) : (
            <>
              {/* Legenda */}
              <div style={{ display: 'flex', gap: '20px', marginBottom: '20px', fontSize: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '2px', backgroundColor: CORES.credito }} />
                  <span style={{ color: CORES.textoSecundario }}>A pagar (futuro)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '2px', backgroundColor: CORES.quitado }} />
                  <span style={{ color: CORES.textoSecundario }}>Pago</span>
                </div>
              </div>

              {/* Barras */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', height: '200px', overflowX: 'auto', paddingBottom: '8px' }}>
                {evolucaoMensal.map((e) => {
                  const alturaPago = (e.pago / maxEvolucao) * 180;
                  const alturaRestante = (e.restante / maxEvolucao) * 180;
                  return (
                    <div key={e.mes} style={estilos.barraEvolucao}>
                      <div style={{ fontSize: '10px', color: CORES.textoSecundario, textAlign: 'center' }}>
                        {formatMoeda(e.pago + e.restante).replace('R$', '').trim()}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px' }}>
                        <div
                          title={`Pago: ${formatMoeda(e.pago)}`}
                          style={{
                            width: '22px',
                            height: `${alturaPago}px`,
                            backgroundColor: CORES.quitado,
                            borderRadius: '3px 3px 0 0',
                            minHeight: '2px',
                          }}
                        />
                        <div
                          title={`A pagar: ${formatMoeda(e.restante)}`}
                          style={{
                            width: '22px',
                            height: `${alturaRestante}px`,
                            backgroundColor: CORES.credito,
                            borderRadius: '3px 3px 0 0',
                            minHeight: '2px',
                          }}
                        />
                      </div>
                      <div style={{ fontSize: '10px', color: CORES.textoSecundario, textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {e.mes}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Tabela resumo mensal */}
              <div style={{ marginTop: '24px', overflowX: 'auto' as const }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f1f5f9' }}>
                      {['Mês', 'Pago', 'A Pagar', 'Total Mês'].map((col) => (
                        <th
                          key={col}
                          style={{
                            padding: '10px 16px',
                            textAlign: col === 'Mês' ? 'left' : 'right',
                            fontWeight: 700,
                            fontSize: '11px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                            color: CORES.textoSecundario,
                            borderBottom: `2px solid ${CORES.borda}`,
                          }}
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {evolucaoMensal.map((e, i) => (
                      <tr
                        key={e.mes}
                        style={{
                          backgroundColor: i % 2 === 0 ? CORES.card : '#f8fafc',
                          borderBottom: `1px solid ${CORES.borda}`,
                        }}
                      >
                        <td style={{ padding: '10px 16px', fontWeight: 600, color: CORES.texto }}>{e.mes}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', color: CORES.quitado, fontWeight: 600 }}>
                          {formatMoeda(e.pago)}
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', color: CORES.credito, fontWeight: 600 }}>
                          {formatMoeda(e.restante)}
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: CORES.texto }}>
                          {formatMoeda(e.pago + e.restante)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

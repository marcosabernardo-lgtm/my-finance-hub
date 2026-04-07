import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://wmvujvyutvwojecwmruy.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdnVqdnl1dHZ3b2plY3dtcnV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMDEwMDgsImV4cCI6MjA4OTY3NzAwOH0.udql_zBepK2fzAxaGcsNsLavZuUSG7vefqSrVT8bABA'
);

const HOUSEHOLD_ID = 'fdfc5a94-c5e4-42d1-b1c2-015dfa492556';

type FiltroSit = 'pendente' | 'previsto' | 'pendente+previsto';
type SituacaoOpcao = 'Pendente' | 'Previsto' | 'Pago' | 'Faturado';

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

interface DividaDesc {
  chave: string;
  descricao: string;
  metodo_pagamento: string;
  cartao_nome: string | null;
  conta_nome: string | null;
  categoria_nome: string | null;
  is_credito: boolean;
  is_parcelamento: boolean;
  total_parcelas: number;
  parcelas_pagas: number;
  parcelas_pendentes: number;
  valor_parcela: number;
  valor_total: number;
  valor_restante: number;
  proxima_parcela: string;
  ultima_parcela: string;
  parcelas: Movimentacao[];
}

interface CartaoGrupo {
  cartao_nome: string;
  valor_restante: number;
  total_dividas: number;
  dividas: DividaDesc[];
}

interface CartaoOpcao { id: string; nome: string; }
interface ContaOpcao  { id: string; nome: string; }

type AbaLista = 'credito' | 'debito' | 'parcelamento';
type AbaView  = AbaLista | 'evolucao';

const CORES = {
  credito:         '#e05252',
  debito:          '#4a9eff',
  parcelamento:    '#9b59b6',
  previsto:        '#f59e0b',
  quitado:         '#52c878',
  fundo:           '#f8fafc',
  sidebar:         '#0d7280',
  texto:           '#1a2332',
  textoSecundario: '#6b7a8d',
  borda:           '#e2e8f0',
  card:            '#ffffff',
  cardHover:       '#f0f9ff',
};
const COR_ABA: Record<AbaLista, string> = {
  credito: CORES.credito, debito: CORES.debito, parcelamento: CORES.parcelamento,
};

const SITUACOES_OPCOES: SituacaoOpcao[] = ['Pendente', 'Previsto', 'Pago', 'Faturado'];

const COR_SITUACAO: Record<string, { bg: string; color: string; border: string }> = {
  'Pago':     { bg: '#dcfce7', color: '#16a34a', border: '#86efac' },
  'Faturado': { bg: '#dbeafe', color: '#1d4ed8', border: '#93c5fd' },
  'Pendente': { bg: '#fef3c7', color: '#d97706', border: '#fcd34d' },
  'Previsto': { bg: '#f3e8ff', color: '#7c3aed', border: '#c4b5fd' },
};

const fmt   = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtD  = (d: string) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '-';
const mesAno = (d: string) => {
  const dt = new Date(d + 'T00:00:00');
  return `${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()}`;
};
const parseP = (s: string) => {
  const m = s?.match(/Parcela (\d+)\/(\d+)/i);
  return m ? { atual: +m[1], total: +m[2] } : { atual: 0, total: 0 };
};
const foiQuitada = (p: Movimentacao, isCredito: boolean) =>
  isCredito ? (p.situacao === 'Faturado' || p.situacao === 'Pago') : p.situacao === 'Pago';

const entraNaContagem = (p: Movimentacao, filtro: FiltroSit) => {
  if (filtro === 'pendente')           return p.situacao === 'Pendente';
  if (filtro === 'previsto')           return p.situacao === 'Previsto';
  if (filtro === 'pendente+previsto')  return p.situacao === 'Pendente' || p.situacao === 'Previsto';
  return false;
};

// ─── Card de parcela com edição de situação ───────────────────────────────────
function CardParcela({
  p, isCredito, onUpdate,
}: {
  p: Movimentacao;
  isCredito: boolean;
  onUpdate: (id: string, novaSituacao: string) => void;
}) {
  const [salvando, setSalvando] = useState(false);
  const [situacaoLocal, setSituacaoLocal] = useState(p.situacao);
  const { atual, total } = parseP(p.numero_parcela);
  const cores = COR_SITUACAO[situacaoLocal] || COR_SITUACAO['Pendente'];
  const pago  = foiQuitada({ ...p, situacao: situacaoLocal }, isCredito);

  async function alterarSituacao(nova: string) {
    if (nova === situacaoLocal) return;
    setSalvando(true);
    try {
      const { error } = await supabase
        .from('movimentacoes')
        .update({ situacao: nova })
        .eq('id', p.id);
      if (!error) {
        setSituacaoLocal(nova);
        onUpdate(p.id, nova);
      } else {
        alert('Erro ao salvar: ' + error.message);
      }
    } catch (e) {
      console.error(e);
    }
    setSalvando(false);
  }

  return (
    <div style={{
      backgroundColor: pago ? '#f0fdf4' : situacaoLocal === 'Previsto' ? '#fdf4ff' : '#fff',
      border: `1.5px solid ${cores.border}`,
      borderRadius: '10px',
      padding: '12px',
      transition: 'all 0.2s',
    }}>
      {/* Badge situação clicável */}
      <div style={{ marginBottom: '8px' }}>
        <select
          value={situacaoLocal}
          disabled={salvando}
          onChange={(e) => alterarSituacao(e.target.value)}
          style={{
            padding: '3px 8px',
            borderRadius: '12px',
            fontSize: '11px',
            fontWeight: 700,
            border: `1px solid ${cores.border}`,
            backgroundColor: cores.bg,
            color: cores.color,
            cursor: salvando ? 'wait' : 'pointer',
            outline: 'none',
            appearance: 'none' as const,
            WebkitAppearance: 'none' as const,
            paddingRight: '20px',
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23${cores.color.replace('#','')}'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 6px center',
          }}
        >
          {SITUACOES_OPCOES.map((s) => (
            <option key={s} value={s}>{salvando && s === situacaoLocal ? 'Salvando...' : s}</option>
          ))}
        </select>
      </div>
      <div style={{ fontSize: '12px', fontWeight: 700, color: CORES.texto }}>Parcela {atual}/{total}</div>
      <div style={{ fontSize: '14px', fontWeight: 800, color: CORES.texto, marginTop: '2px' }}>{fmt(p.valor)}</div>
      <div style={{ fontSize: '11px', color: CORES.textoSecundario, marginTop: '4px' }}>
        Venc: {fmtD(p.data_pagamento)}
      </div>
      {salvando && (
        <div style={{ fontSize: '10px', color: CORES.sidebar, marginTop: '4px', fontWeight: 600 }}>
          Salvando...
        </div>
      )}
    </div>
  );
}

// ─── Drill de parcelas com edição ─────────────────────────────────────────────
function DrillParcelas({
  parcelas, isCredito, onUpdate,
}: {
  parcelas: Movimentacao[];
  isCredito: boolean;
  onUpdate: (id: string, nova: string) => void;
}) {
  const ordenadas = [...parcelas].sort((a, b) => (a.data_pagamento||'').localeCompare(b.data_pagamento||''));
  return (
    <div style={{ backgroundColor: '#f8fafc', borderBottom: `1px solid ${CORES.borda}`, padding: '16px 20px 20px' }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: CORES.texto, marginBottom: '4px' }}>
        Parcelas ({parcelas.length} no total)
      </div>
      <div style={{ fontSize: '11px', color: CORES.textoSecundario, marginBottom: '12px' }}>
        Clique na situação para alterar diretamente
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '8px' }}>
        {ordenadas.map((p) => (
          <CardParcela key={p.id} p={p} isCredito={isCredito} onUpdate={onUpdate} />
        ))}
      </div>
    </div>
  );
}

// ─── Linha de dívida Débito/Parcelamento ──────────────────────────────────────
function LinhaDivida({
  d, corBarra, isCredito, onUpdate,
}: {
  d: DividaDesc; corBarra: string; isCredito: boolean;
  onUpdate: (id: string, nova: string) => void;
}) {
  const [hov, setHov]   = useState(false);
  const [open, setOpen] = useState(false);
  const pct = d.total_parcelas > 0 ? (d.parcelas_pagas / d.total_parcelas) * 100 : 0;

  return (
    <>
      <div
        style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 70px', padding: '14px 20px', borderBottom: `1px solid ${CORES.borda}`, cursor: 'pointer', backgroundColor: hov ? CORES.cardHover : CORES.card, transition: 'background 0.12s', alignItems: 'center' }}
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
      >
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: CORES.texto }}>{d.descricao}</div>
          {d.categoria_nome && <div style={{ fontSize: '11px', color: CORES.textoSecundario, marginTop: '2px' }}>{d.categoria_nome}</div>}
        </div>
        <div>
          <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, backgroundColor: d.is_parcelamento ? '#f3e8ff' : '#e8f0fe', color: d.is_parcelamento ? CORES.parcelamento : CORES.debito }}>
            {d.metodo_pagamento}
          </span>
        </div>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: CORES.texto }}>{d.parcelas_pagas}/{d.total_parcelas}</div>
          <div style={{ width: '100%', height: '6px', backgroundColor: '#e9ecef', borderRadius: '3px', overflow: 'hidden', marginTop: '4px' }}>
            <div style={{ width: `${Math.min(100,pct)}%`, height: '100%', backgroundColor: corBarra, borderRadius: '3px' }} />
          </div>
          <div style={{ fontSize: '10px', color: CORES.textoSecundario, marginTop: '2px' }}>{pct.toFixed(0)}% pago</div>
        </div>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: corBarra }}>{fmt(d.valor_restante)}</div>
          <div style={{ fontSize: '10px', color: CORES.textoSecundario }}>de {fmt(d.valor_total)}</div>
        </div>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: CORES.texto }}>{d.ultima_parcela ? fmtD(d.ultima_parcela) : '-'}</div>
          {d.proxima_parcela && <div style={{ fontSize: '10px', color: CORES.textoSecundario }}>Próx: {fmtD(d.proxima_parcela)}</div>}
        </div>
        <div style={{ textAlign: 'center' as const }}>
          <span style={{ display: 'inline-block', width: '28px', height: '28px', lineHeight: '28px', borderRadius: '50%', backgroundColor: open ? CORES.sidebar : '#e2e8f0', color: open ? '#fff' : CORES.textoSecundario, fontSize: '13px', fontWeight: 700, userSelect: 'none' as const }}>
            {open ? '▲' : '▼'}
          </span>
        </div>
      </div>
      {open && <DrillParcelas parcelas={d.parcelas} isCredito={isCredito} onUpdate={onUpdate} />}
    </>
  );
}

// ─── Tabela Débito/Parcelamento ───────────────────────────────────────────────
function TabelaDebito({
  dividas, corBarra, isCredito, onUpdate,
}: {
  dividas: DividaDesc[]; corBarra: string; isCredito: boolean;
  onUpdate: (id: string, nova: string) => void;
}) {
  if (dividas.length === 0) return (
    <div style={{ textAlign: 'center' as const, padding: '60px 20px', color: CORES.textoSecundario, fontSize: '15px' }}>
      🎉 Nenhuma dívida ativa nesta categoria.
    </div>
  );
  return (
    <div style={{ backgroundColor: CORES.card, border: `1px solid ${CORES.borda}`, borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 70px', padding: '12px 20px', backgroundColor: '#f1f5f9', borderBottom: `1px solid ${CORES.borda}` }}>
        {['Descrição', 'Método', 'Parcelas', 'Restante', 'Quitação Prev.', ''].map((h) => (
          <div key={h} style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: CORES.textoSecundario }}>{h}</div>
        ))}
      </div>
      {dividas.map((d) => (
        <LinhaDivida key={d.chave} d={d} corBarra={corBarra} isCredito={isCredito} onUpdate={onUpdate} />
      ))}
    </div>
  );
}

// ─── Tabela Crédito agrupado por cartão ──────────────────────────────────────
function TabelaCredito({
  cartoes, onUpdate,
}: {
  cartoes: CartaoGrupo[];
  onUpdate: (id: string, nova: string) => void;
}) {
  const [cartaoAberto, setCartaoAberto] = useState<string | null>(cartoes[0]?.cartao_nome ?? null);
  const [dividaAberta, setDividaAberta] = useState<string | null>(null);

  if (cartoes.length === 0) return (
    <div style={{ textAlign: 'center' as const, padding: '60px 20px', color: CORES.textoSecundario, fontSize: '15px' }}>
      🎉 Nenhuma dívida de crédito ativa.
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '16px' }}>
      {cartoes.map((cg) => {
        const aberto = cartaoAberto === cg.cartao_nome;
        return (
          <div key={cg.cartao_nome} style={{ backgroundColor: CORES.card, border: `1px solid ${CORES.borda}`, borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            {/* Cabeçalho cartão */}
            <div
              onClick={() => { setCartaoAberto(aberto ? null : cg.cartao_nome); setDividaAberta(null); }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', backgroundColor: aberto ? '#fff5f5' : '#f8fafc', borderBottom: aberto ? `1px solid ${CORES.borda}` : 'none', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: CORES.credito, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>💳</div>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: CORES.texto }}>{cg.cartao_nome}</div>
                  <div style={{ fontSize: '12px', color: CORES.textoSecundario }}>{cg.total_dividas} compra(s) parcelada(s)</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ textAlign: 'right' as const }}>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: CORES.credito }}>{fmt(cg.valor_restante)}</div>
                  <div style={{ fontSize: '11px', color: CORES.textoSecundario }}>saldo devedor</div>
                </div>
                <span style={{ display: 'inline-block', width: '28px', height: '28px', lineHeight: '28px', borderRadius: '50%', backgroundColor: aberto ? CORES.credito : '#e2e8f0', color: aberto ? '#fff' : CORES.textoSecundario, fontSize: '13px', fontWeight: 700, textAlign: 'center' as const, userSelect: 'none' as const }}>
                  {aberto ? '▲' : '▼'}
                </span>
              </div>
            </div>

            {aberto && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 70px', padding: '10px 20px', backgroundColor: '#fafafa', borderBottom: `1px solid ${CORES.borda}` }}>
                  {['Descrição / Categoria', 'Parcelas', 'Vlr. Parcela', 'Restante', ''].map((h) => (
                    <div key={h} style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: CORES.textoSecundario }}>{h}</div>
                  ))}
                </div>
                {cg.dividas.map((d) => {
                  const pct  = d.total_parcelas > 0 ? (d.parcelas_pagas / d.total_parcelas) * 100 : 0;
                  const open = dividaAberta === d.chave;
                  return (
                    <div key={d.chave}>
                      <div
                        onClick={() => setDividaAberta(open ? null : d.chave)}
                        style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 70px', padding: '12px 20px', borderBottom: `1px solid ${CORES.borda}`, cursor: 'pointer', backgroundColor: open ? CORES.cardHover : CORES.card, alignItems: 'center' }}
                      >
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 600, color: CORES.texto }}>{d.descricao}</div>
                          {d.categoria_nome && <div style={{ fontSize: '11px', color: CORES.textoSecundario }}>{d.categoria_nome}</div>}
                        </div>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: CORES.texto }}>{d.parcelas_pagas}/{d.total_parcelas}</div>
                          <div style={{ width: '100%', height: '5px', backgroundColor: '#e9ecef', borderRadius: '3px', overflow: 'hidden', marginTop: '4px' }}>
                            <div style={{ width: `${Math.min(100,pct)}%`, height: '100%', backgroundColor: CORES.credito, borderRadius: '3px' }} />
                          </div>
                          <div style={{ fontSize: '10px', color: CORES.textoSecundario, marginTop: '2px' }}>{pct.toFixed(0)}% pago</div>
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: CORES.texto }}>{fmt(d.valor_parcela)}</div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: CORES.credito }}>{fmt(d.valor_restante)}</div>
                        <div style={{ textAlign: 'center' as const }}>
                          <span style={{ display: 'inline-block', width: '24px', height: '24px', lineHeight: '24px', borderRadius: '50%', backgroundColor: open ? CORES.credito : '#e2e8f0', color: open ? '#fff' : CORES.textoSecundario, fontSize: '12px', userSelect: 'none' as const }}>
                            {open ? '▲' : '▼'}
                          </span>
                        </div>
                      </div>
                      {open && <DrillParcelas parcelas={d.parcelas} isCredito={true} onUpdate={onUpdate} />}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Endividamento() {
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [cartoes,       setCartoes]       = useState<CartaoOpcao[]>([]);
  const [contas,        setContas]        = useState<ContaOpcao[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [filtroCartao,  setFiltroCartao]  = useState('');
  const [filtroConta,   setFiltroConta]   = useState('');
  const [filtroSit,     setFiltroSit]     = useState<FiltroSit>('pendente');
  const [abaAtiva,      setAbaAtiva]      = useState<AbaView>('credito');

  useEffect(() => { carregarDados(); }, []);

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
        setMovimentacoes(movRes.data.filter((m) => parseP(m.numero_parcela).total > 1));
      }
      if (cartRes.data) setCartoes(cartRes.data);
      if (contRes.data) setContas(contRes.data);
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  // Atualiza situação localmente sem recarregar tudo
  function handleUpdate(id: string, novaSituacao: string) {
    setMovimentacoes((prev) =>
      prev.map((m) => m.id === id ? { ...m, situacao: novaSituacao } : m)
    );
  }

  const dividasAgrupadas = useMemo<DividaDesc[]>(() => {
    const porGrupo: Record<string, Movimentacao[]> = {};
    for (const m of movimentacoes) {
      if (!porGrupo[m.grupo_id]) porGrupo[m.grupo_id] = [];
      porGrupo[m.grupo_id].push(m);
    }

    const grupos = Object.entries(porGrupo).map(([, parcelas]) => {
      parcelas.sort((a, b) => parseP(a.numero_parcela).atual - parseP(b.numero_parcela).atual);
      const p0         = parcelas[0];
      const isCredito  = !!p0.cartao_id || p0.metodo_pagamento === 'Crédito';
      const catNome    = (p0 as any).categorias?.nome || null;
      const isParc     = !isCredito && (catNome || '').toLowerCase() === 'parcelamento';
      const cartaoNome = (p0 as any).cartoes?.nome || null;
      const pendentes  = parcelas.filter((p) => entraNaContagem(p, filtroSit));
      const pagas      = parcelas.filter((p) => foiQuitada(p, isCredito)).length;
      const { total }  = parseP(p0.numero_parcela);
      return { p0, parcelas, isCredito, isParc, cartaoNome, catNome, pendentes, pagas, total };
    }).filter((g) => g.pendentes.length > 0);

    const porDesc: Record<string, typeof grupos> = {};
    for (const g of grupos) {
      const chave = g.isCredito
        ? `${g.cartaoNome}||${g.p0.descricao.trim().toLowerCase()}`
        : g.p0.descricao.trim().toLowerCase();
      if (!porDesc[chave]) porDesc[chave] = [];
      porDesc[chave].push(g);
    }

    return Object.entries(porDesc).map(([chave, gs]) => {
      const todasParcelas = gs.flatMap((g) => g.parcelas);
      const totalParcelas = gs.reduce((s, g) => s + g.total, 0);
      const totalPagas    = gs.reduce((s, g) => s + g.pagas, 0);
      const totalPend     = gs.reduce((s, g) => s + g.pendentes.length, 0);
      const pendOrd       = gs.flatMap((g) => g.pendentes).sort((a, b) => (a.data_pagamento||'').localeCompare(b.data_pagamento||''));
      const p0            = gs[0].p0;
      return {
        chave,
        descricao:          p0.descricao,
        metodo_pagamento:   gs[0].isCredito ? 'Crédito' : p0.metodo_pagamento,
        cartao_nome:        gs[0].cartaoNome,
        conta_nome:         p0.conta_origem_destino || null,
        categoria_nome:     gs[0].catNome,
        is_credito:         gs[0].isCredito,
        is_parcelamento:    gs[0].isParc,
        total_parcelas:     totalParcelas,
        parcelas_pagas:     totalPagas,
        parcelas_pendentes: totalPend,
        valor_parcela:      p0.valor,
        valor_total:        p0.valor * totalParcelas,
        valor_restante:     p0.valor * totalPend,
        proxima_parcela:    pendOrd[0]?.data_pagamento || '',
        ultima_parcela:     pendOrd[pendOrd.length - 1]?.data_pagamento || '',
        parcelas:           todasParcelas,
      } as DividaDesc;
    });
  }, [movimentacoes, filtroSit]);

  const dividasFiltradas = useMemo(() => dividasAgrupadas.filter((d) => {
    if (filtroCartao && d.cartao_nome !== filtroCartao) return false;
    if (filtroConta  && d.conta_nome  !== filtroConta)  return false;
    return true;
  }), [dividasAgrupadas, filtroCartao, filtroConta]);

  const porAba = useMemo(() => ({
    credito:      dividasFiltradas.filter((d) =>  d.is_credito),
    debito:       dividasFiltradas.filter((d) => !d.is_credito && !d.is_parcelamento),
    parcelamento: dividasFiltradas.filter((d) =>  d.is_parcelamento),
  }), [dividasFiltradas]);

  const creditoPorCartao = useMemo<CartaoGrupo[]>(() => {
    const map: Record<string, DividaDesc[]> = {};
    for (const d of porAba.credito) {
      const key = d.cartao_nome || 'Sem cartão';
      if (!map[key]) map[key] = [];
      map[key].push(d);
    }
    return Object.entries(map).map(([cartao_nome, dividas]) => ({
      cartao_nome,
      valor_restante: dividas.reduce((s, d) => s + d.valor_restante, 0),
      total_dividas:  dividas.length,
      dividas,
    })).sort((a, b) => b.valor_restante - a.valor_restante);
  }, [porAba.credito]);

  const totais = useMemo(() => {
    const credito      = porAba.credito.reduce((s, d) => s + d.valor_restante, 0);
    const debito       = porAba.debito.reduce((s, d) => s + d.valor_restante, 0);
    const parcelamento = porAba.parcelamento.reduce((s, d) => s + d.valor_restante, 0);
    return { credito, debito, parcelamento, total: credito + debito + parcelamento };
  }, [porAba]);

  const evolucaoMensal = useMemo(() => {
    const meses: Record<string, { restante: number; pago: number }> = {};
    for (const d of dividasFiltradas) {
      for (const p of d.parcelas) {
        const mes = mesAno(p.data_pagamento);
        if (!meses[mes]) meses[mes] = { restante: 0, pago: 0 };
        if (foiQuitada(p, d.is_credito))     meses[mes].pago += p.valor;
        else if (entraNaContagem(p, filtroSit)) meses[mes].restante += p.valor;
      }
    }
    return Object.entries(meses)
      .sort(([a],[b]) => {
        const [ma,ya] = a.split('/'); const [mb,yb] = b.split('/');
        return new Date(+ya,+ma-1).getTime() - new Date(+yb,+mb-1).getTime();
      })
      .map(([mes,v]) => ({ mes, ...v }));
  }, [dividasFiltradas, filtroSit]);

  const maxEvol = Math.max(...evolucaoMensal.map((e) => e.restante + e.pago), 1);

  if (loading) return (
    <div style={{ padding: '24px', backgroundColor: CORES.fundo, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: CORES.textoSecundario, fontSize: '16px' }}>Carregando endividamento...</div>
    </div>
  );

  const abasLista: { key: AbaLista; label: string; emoji: string }[] = [
    { key: 'credito',      label: 'Crédito',      emoji: '💳' },
    { key: 'debito',       label: 'Débito / PIX', emoji: '🏦' },
    { key: 'parcelamento', label: 'Parcelamento', emoji: '📋' },
  ];

  const botoesSit: { key: FiltroSit; label: string }[] = [
    { key: 'pendente',          label: 'Pendentes' },
    { key: 'previsto',          label: 'Previstos' },
    { key: 'pendente+previsto', label: 'Pendentes + Previstos' },
  ];

  return (
    <div style={{ padding: '24px', backgroundColor: CORES.fundo, minHeight: '100vh', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>

      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: CORES.texto, margin: 0 }}>Endividamento</h1>
          <p style={{ fontSize: '14px', color: CORES.textoSecundario, margin: '4px 0 0' }}>Gerencie seus parcelamentos ativos e altere situações diretamente</p>
        </div>
        <button onClick={carregarDados} style={{ padding: '8px 16px', borderRadius: '8px', border: `1px solid ${CORES.borda}`, backgroundColor: CORES.card, color: CORES.texto, fontSize: '13px', cursor: 'pointer' }}>
          ↻ Atualizar
        </button>
      </div>

      {/* 4 Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Total em Dívidas', valor: totais.total,        cor: CORES.texto,        borda: 'transparent',      sub: `${dividasFiltradas.length} item(s)` },
          { label: '💳 Crédito',       valor: totais.credito,      cor: CORES.credito,      borda: CORES.credito,      sub: `${creditoPorCartao.length} cartão(ões)` },
          { label: '🏦 Débito / PIX',  valor: totais.debito,       cor: CORES.debito,       borda: CORES.debito,       sub: `${porAba.debito.length} item(s)` },
          { label: '📋 Parcelamento',  valor: totais.parcelamento, cor: CORES.parcelamento, borda: CORES.parcelamento, sub: `${porAba.parcelamento.length} item(s)` },
        ].map((c) => (
          <div key={c.label} style={{ backgroundColor: CORES.card, border: `1px solid ${CORES.borda}`, borderLeft: `4px solid ${c.borda}`, borderRadius: '12px', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: CORES.textoSecundario, marginBottom: '8px' }}>{c.label}</div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: c.cor }}>{fmt(c.valor)}</div>
            <div style={{ fontSize: '12px', color: CORES.textoSecundario, marginTop: '4px' }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' as const, alignItems: 'center' }}>

        {/* 3 botões de situação */}
        <div style={{ display: 'flex', borderRadius: '8px', border: `1.5px solid ${CORES.borda}`, overflow: 'hidden' }}>
          {botoesSit.map((b, i) => {
            const ativo = filtroSit === b.key;
            return (
              <button key={b.key} onClick={() => setFiltroSit(b.key)}
                style={{
                  padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                  border: 'none',
                  borderRight: i < botoesSit.length - 1 ? `1px solid ${CORES.borda}` : 'none',
                  backgroundColor: ativo ? CORES.sidebar : CORES.card,
                  color: ativo ? '#fff' : CORES.texto,
                  transition: 'all 0.15s',
                  whiteSpace: 'nowrap' as const,
                }}>
                {b.label}
              </button>
            );
          })}
        </div>

        <select style={{ padding: '8px 12px', borderRadius: '8px', border: `1px solid ${CORES.borda}`, backgroundColor: CORES.card, color: CORES.texto, fontSize: '14px', cursor: 'pointer', outline: 'none', minWidth: '160px' }}
          value={filtroCartao} onChange={(e) => { setFiltroCartao(e.target.value); setFiltroConta(''); }}>
          <option value="">Todos os cartões</option>
          {cartoes.map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
        </select>

        <select style={{ padding: '8px 12px', borderRadius: '8px', border: `1px solid ${CORES.borda}`, backgroundColor: CORES.card, color: CORES.texto, fontSize: '14px', cursor: 'pointer', outline: 'none', minWidth: '160px' }}
          value={filtroConta} onChange={(e) => { setFiltroConta(e.target.value); setFiltroCartao(''); }}>
          <option value="">Todas as contas</option>
          {contas.map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
        </select>

        {(filtroCartao || filtroConta) && (
          <button style={{ padding: '8px 16px', borderRadius: '8px', border: `1.5px solid ${CORES.credito}`, backgroundColor: CORES.card, color: CORES.credito, fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
            onClick={() => { setFiltroCartao(''); setFiltroConta(''); }}>
            ✕ Limpar filtros
          </button>
        )}
      </div>

      {/* Abas */}
      <div style={{ display: 'flex', marginBottom: '20px', borderBottom: `2px solid ${CORES.borda}` }}>
        {abasLista.map((a) => {
          const ativo = abaAtiva === a.key;
          const cor   = COR_ABA[a.key];
          const cnt   = a.key === 'credito' ? creditoPorCartao.length : porAba[a.key].length;
          return (
            <button key={a.key} onClick={() => setAbaAtiva(a.key)}
              style={{ padding: '10px 22px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', border: 'none', background: 'none', color: ativo ? cor : CORES.textoSecundario, borderBottom: `2px solid ${ativo ? cor : 'transparent'}`, marginBottom: '-2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {a.emoji} {a.label}
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '20px', height: '20px', padding: '0 6px', borderRadius: '10px', backgroundColor: ativo ? cor : '#e2e8f0', color: ativo ? '#fff' : CORES.textoSecundario, fontSize: '11px', fontWeight: 700 }}>
                {cnt}
              </span>
            </button>
          );
        })}
        <button onClick={() => setAbaAtiva('evolucao')}
          style={{ padding: '10px 22px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', border: 'none', background: 'none', color: abaAtiva === 'evolucao' ? CORES.sidebar : CORES.textoSecundario, borderBottom: `2px solid ${abaAtiva === 'evolucao' ? CORES.sidebar : 'transparent'}`, marginBottom: '-2px' }}>
          📈 Evolução Mensal
        </button>
      </div>

      {/* Conteúdo abas */}
      {abaAtiva === 'credito'      && <TabelaCredito cartoes={creditoPorCartao} onUpdate={handleUpdate} />}
      {abaAtiva === 'debito'       && <TabelaDebito dividas={porAba.debito}       corBarra={CORES.debito}       isCredito={false} onUpdate={handleUpdate} />}
      {abaAtiva === 'parcelamento' && <TabelaDebito dividas={porAba.parcelamento} corBarra={CORES.parcelamento} isCredito={false} onUpdate={handleUpdate} />}

      {/* Aba Evolução */}
      {abaAtiva === 'evolucao' && (
        <div style={{ backgroundColor: CORES.card, border: `1px solid ${CORES.borda}`, borderRadius: '12px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: CORES.texto, marginBottom: '20px' }}>Comprometimento mensal</div>
          {evolucaoMensal.length === 0 ? (
            <div style={{ textAlign: 'center' as const, padding: '40px', color: CORES.textoSecundario }}>Sem dados para exibir.</div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '20px', marginBottom: '20px', fontSize: '12px' }}>
                {([['#e05252','A pagar'],['#52c878','Pago']] as [string,string][]).map(([cor,label]) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '2px', backgroundColor: cor }} />
                    <span style={{ color: CORES.textoSecundario }}>{label}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', height: '200px', overflowX: 'auto' as const, paddingBottom: '8px' }}>
                {evolucaoMensal.map((e) => {
                  const hP = (e.pago/maxEvol)*180, hR = (e.restante/maxEvol)*180;
                  return (
                    <div key={e.mes} style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '6px', flex: 1, minWidth: '60px' }}>
                      <div style={{ fontSize: '10px', color: CORES.textoSecundario, textAlign: 'center' as const }}>{fmt(e.pago+e.restante).replace('R$','').trim()}</div>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px' }}>
                        <div style={{ width:'22px', height:`${hP}px`, backgroundColor: CORES.quitado, borderRadius:'3px 3px 0 0', minHeight:'2px' }} />
                        <div style={{ width:'22px', height:`${hR}px`, backgroundColor: CORES.credito, borderRadius:'3px 3px 0 0', minHeight:'2px' }} />
                      </div>
                      <div style={{ fontSize:'10px', color: CORES.textoSecundario, textAlign:'center' as const, whiteSpace:'nowrap' as const }}>{e.mes}</div>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: '24px', overflowX: 'auto' as const }}>
                <table style={{ width:'100%', borderCollapse:'collapse' as const, fontSize:'13px' }}>
                  <thead>
                    <tr style={{ backgroundColor:'#f1f5f9' }}>
                      {['Mês','Pago','A Pagar','Total Mês'].map((col) => (
                        <th key={col} style={{ padding:'10px 16px', textAlign: col==='Mês' ? 'left' : 'right' as const, fontWeight:700, fontSize:'11px', textTransform:'uppercase' as const, letterSpacing:'0.5px', color: CORES.textoSecundario, borderBottom:`2px solid ${CORES.borda}` }}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {evolucaoMensal.map((e,i) => (
                      <tr key={e.mes} style={{ backgroundColor: i%2===0 ? CORES.card : '#f8fafc', borderBottom:`1px solid ${CORES.borda}` }}>
                        <td style={{ padding:'10px 16px', fontWeight:600, color: CORES.texto }}>{e.mes}</td>
                        <td style={{ padding:'10px 16px', textAlign:'right' as const, color: CORES.quitado, fontWeight:600 }}>{fmt(e.pago)}</td>
                        <td style={{ padding:'10px 16px', textAlign:'right' as const, color: CORES.credito, fontWeight:600 }}>{fmt(e.restante)}</td>
                        <td style={{ padding:'10px 16px', textAlign:'right' as const, fontWeight:700, color: CORES.texto }}>{fmt(e.pago+e.restante)}</td>
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

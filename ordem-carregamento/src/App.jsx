import React, { useState, useEffect, useMemo } from 'react';
import {
  Truck, Package, FilePlus, History as HistoryIcon, Printer,
  Trash2, Plus, Save, ClipboardList, LogOut, X, ShieldCheck
} from 'lucide-react';
import { supabase } from './supabaseClient';
import Auth from './Auth';

const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateBR = (iso) => { if (!iso) return '____.____.______'; const [y, m, d] = iso.split('-'); return `${d}.${m}.${y}`; };
const productLabel = (p) => p ? `${p.especie} ${p.descricao} — ${p.unidade}` : '';

const blankOrder = () => ({
  dataEntrega: '', hora: '', nf: '', transportadora: '1',
  truckId: '', motorista: '',
  produtores: [{ id: 1, nome: '', items: [{ id: 1, productId: '', quantidade: '', precoOverride: '', lote: '' }] }],
});

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading, null = logged out
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setProfile(null); return; }
    supabase.from('profiles').select('*').eq('id', session.user.id).single()
      .then(({ data }) => setProfile(data));
  }, [session]);

  if (session === undefined) return <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>Carregando…</div>;
  if (!session) return <Auth />;
  if (!profile) return <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>Preparando sua conta…</div>;

  return <Main session={session} profile={profile} />;
}

function Main({ session, profile }) {
  const isAdmin = profile.role === 'admin';
  const [tab, setTab] = useState('nova');
  const [trucks, setTrucks] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [order, setOrder] = useState(blankOrder());
  const [saveState, setSaveState] = useState('idle');

  const tabs = [
    { key: 'nova', label: 'Nova Ordem', icon: FilePlus },
    ...(isAdmin ? [
      { key: 'caminhoes', label: 'Caminhões', icon: Truck },
      { key: 'produtos', label: 'Produtos', icon: Package },
    ] : []),
    { key: 'historico', label: 'Histórico', icon: HistoryIcon },
  ];

  const loadAll = async () => {
    const [{ data: t }, { data: p }, { data: o }] = await Promise.all([
      supabase.from('trucks').select('*').order('placa'),
      supabase.from('products').select('*').order('descricao'),
      supabase.from('orders').select('*').order('created_at', { ascending: false }),
    ]);
    setTrucks(t || []); setProducts(p || []); setOrders(o || []);
  };
  useEffect(() => { loadAll(); }, []);

  // ---- Caminhões ----
  const [truckForm, setTruckForm] = useState({ placa: '', motorista: ''});
  const addTruck = async () => {
    if (!truckForm.placa.trim() || !truckForm.motorista.trim()) return;
    const { error } = await supabase.from('trucks').insert({
      placa: truckForm.placa, motorista: truckForm.motorista,
    });
    if (!error) { setTruckForm({ placa: '', motorista: ''}); loadAll(); }
  };
  const removeTruck = async (id) => { await supabase.from('trucks').delete().eq('id', id); loadAll(); };

  // ---- Produtos ----
  const [productForm, setProductForm] = useState({ descricao: '', unidade: 'Sacos 50kg', especie: 'ADUBO' });
  const addProduct = async () => {
    if (!productForm.descricao.trim()) return;
    const { error } = await supabase.from('products').insert({
      descricao: productForm.descricao, unidade: productForm.unidade, especie: productForm.especie,
    });
    if (!error) { setProductForm({ descricao: '', unidade: 'Sacos 50kg', especie: 'ADUBO' }); loadAll(); }
  };
  const removeProduct = async (id) => { await supabase.from('products').delete().eq('id', id); loadAll(); };

  // ---- Ordem ----
  const updateItem = (pid, itemId, patch) =>
  setOrder(o => ({ ...o, produtores: o.produtores.map(p => p.id === pid ? { ...p, items: p.items.map(it => it.id === itemId ? { ...it, ...patch } : it) } : p) }));
  const addItem = (pid) =>
    setOrder(o => ({ ...o, produtores: o.produtores.map(p => p.id === pid ? { ...p, items: [...p.items, { id: Date.now(), productId: '', quantidade: '', precoOverride: '', lote: '' }] } : p) }));
  const removeItem = (pid, itemId) =>
    setOrder(o => ({ ...o, produtores: o.produtores.map(p => p.id === pid ? { ...p, items: p.items.filter(it => it.id !== itemId) } : p) }));
  
  const selectedTruck = trucks.find(t => t.id === order.truckId);

  const produtoresComputed = useMemo(() => order.produtores.map(p => {
    const items = p.items.map(it => {
      const prod = products.find(pr => pr.id === it.productId);
      const preco = Number(it.precoOverride) || 0;
      const qtd = Number(it.quantidade) || 0;
      return { ...it, prod, preco, total: preco * qtd };
    });
    const subtotalSacos = items.reduce((s, it) => s + (Number(it.quantidade) || 0), 0);
    const subtotalValor = items.reduce((s, it) => s + it.total, 0);
    return { ...p, items, subtotalSacos, subtotalValor };
  }), [order.produtores, products]);

  const totalSacos = produtoresComputed.reduce((s, p) => s + p.subtotalSacos, 0);
  const totalValor = produtoresComputed.reduce((s, p) => s + p.subtotalValor, 0);

  const updateProdutorNome = (pid, nome) =>
  setOrder(o => ({ ...o, produtores: o.produtores.map(p => p.id === pid ? { ...p, nome } : p) }));
  const addProdutor = () =>
    setOrder(o => ({ ...o, produtores: [...o.produtores, { id: Date.now(), nome: '', items: [{ id: Date.now() + 1, productId: '', quantidade: '', precoOverride: '', lote: '' }] }] }));
  const removeProdutor = (pid) =>
    setOrder(o => ({ ...o, produtores: o.produtores.filter(p => p.id !== pid) }));

const totalProdutores = order.produtores.reduce((s, p) => s + (Number(p.quantidade) || 0), 0);


const saveOrder = async () => {
  setSaveState('saving');
  const { error } = await supabase.from('orders').insert({
      created_by: session.user.id,
      data_entrega: order.dataEntrega || null,
      hora: order.hora || null,
      nf: order.nf, transportadora: order.transportadora, truck_id: order.truckId || null, motorista: order.motorista,
      produtores: produtoresComputed.filter(p => p.nome).map(p => ({
        nome: p.nome,
        items: p.items.filter(it => it.productId).map(it => ({
          productId: it.productId, descricao: it.prod?.descricao, quantidade: Number(it.quantidade) || 0,
          preco: it.preco, total: it.total, lote: it.lote,
        })),
        subtotalSacos: p.subtotalSacos, subtotalValor: p.subtotalValor,
      })),
      total_sacos: totalSacos, total_valor: totalValor,
    });
    if (!error) { await loadAll(); setSaveState('saved'); setTimeout(() => setSaveState('idle'), 1800); }
    else setSaveState('idle');
  };

  const deleteOrder = async (id) => { await supabase.from('orders').delete().eq('id', id); loadAll(); };
  const loadOrderIntoForm = (o) => {
    setOrder({
      dataEntrega: o.data_entrega || '', hora: o.hora || '', nf: o.nf || '', transportadora: o.transportadora || '1',
      truckId: o.truck_id || '', motorista: o.motorista || '',
      produtores: (o.produtores && o.produtores.length ? o.produtores : [{ nome: '', items: [] }]).map((p, i) => ({
        id: i + 1,
        nome: p.nome,
        items: (p.items || []).map((it, j) => ({ id: j + 1, productId: it.productId, quantidade: it.quantidade, precoOverride: it.preco ? String(it.preco) : '', lote: it.lote })),
      })),
    });
    setTab('nova');
  };

  const startNewOrder = () => setOrder(blankOrder());
  const handlePrint = () => window.print();
  const signOut = () => supabase.auth.signOut();

  return (
    <div className="ocw-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        .ocw-root { --paper:#F6F2E7; --paper-dim:#EDE6D3; --ink:#21281D; --ink-soft:#5B6350; --green:#3E5A38; --green-deep:#2C4128; --amber:#B8842A; --rule:#C7BC9E; --rule-strong:#A79A76; --danger:#9C3B2E; font-family:'IBM Plex Sans',system-ui,sans-serif; color:var(--ink); background:var(--paper-dim); min-height:100vh; padding:0 0 4rem; }
        .ocw-root * { box-sizing:border-box; }
        .ocw-mono { font-family:'IBM Plex Mono',monospace; }
        .ocw-header { background:var(--green-deep); color:var(--paper); padding:1.2rem 1.5rem; border-bottom:3px solid var(--amber); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.6rem; }
        .ocw-header h1 { font-family:'Fraunces',serif; font-size:1.35rem; font-weight:600; margin:0; }
        .ocw-header .who { font-size:0.78rem; color:#C9D6C2; display:flex; align-items:center; gap:0.8rem; font-family:'IBM Plex Mono',monospace; }
        .ocw-badge { background:var(--amber); color:#2A1C05; padding:0.15rem 0.5rem; border-radius:20px; font-weight:700; font-size:0.7rem; }
        .ocw-signout { background:none; border:1px solid #6f8a67; color:#E5EBDF; border-radius:6px; padding:0.3rem 0.6rem; cursor:pointer; display:flex; align-items:center; gap:0.3rem; font-size:0.78rem; }
        .ocw-tabs { display:flex; gap:2px; padding:0 1rem; background:var(--green-deep); overflow-x:auto; }
        .ocw-tab { display:flex; align-items:center; gap:0.4rem; padding:0.6rem 1rem 0.7rem; font-size:0.82rem; font-weight:600; border:none; cursor:pointer; background:#33472F; color:#D9E0CF; border-radius:8px 8px 0 0; white-space:nowrap; }
        .ocw-tab.active { background:var(--paper); color:var(--green-deep); }
        .ocw-body { padding:1.4rem; max-width:1200px; margin:0 auto; }
        .ocw-card { background:var(--paper); border:1px solid var(--rule); border-radius:10px; padding:1.1rem 1.2rem; margin-bottom:1rem; }
        .ocw-card h2 { font-family:'Fraunces',serif; font-size:1.05rem; font-weight:600; margin:0 0 0.9rem; color:var(--green-deep); display:flex; align-items:center; gap:0.5rem; }
        .ocw-field { display:flex; flex-direction:column; gap:0.28rem; }
        .ocw-field label { font-size:0.72rem; font-weight:600; color:var(--ink-soft); text-transform:uppercase; letter-spacing:0.04em; }
        .ocw-field input, .ocw-field select { border:1px solid var(--rule-strong); background:#FDFBF5; border-radius:6px; padding:0.5rem 0.6rem; font-size:0.88rem; color:var(--ink); }
        .ocw-grid { display:grid; gap:0.7rem; }
        .ocw-grid.g2 { grid-template-columns:repeat(2,1fr); }
        .ocw-grid.g3 { grid-template-columns:repeat(3,1fr); }
        .ocw-grid.g4 { grid-template-columns:repeat(4,1fr); }
        @media (max-width:760px){ .ocw-grid.g2,.ocw-grid.g3,.ocw-grid.g4{grid-template-columns:1fr 1fr;} }
        @media (max-width:480px){ .ocw-grid.g2,.ocw-grid.g3,.ocw-grid.g4{grid-template-columns:1fr;} }
        .ocw-btn { display:inline-flex; align-items:center; gap:0.4rem; border:none; border-radius:7px; padding:0.55rem 0.95rem; font-size:0.84rem; font-weight:600; cursor:pointer; }
        .ocw-btn.primary { background:var(--green); color:white; }
        .ocw-btn.amber { background:var(--amber); color:#2A1C05; }
        .ocw-btn.ghost { background:transparent; color:var(--green-deep); border:1px solid var(--rule-strong); }
        .ocw-btn.danger { background:transparent; color:var(--danger); padding:0.35rem 0.5rem; }
        .ocw-btn:disabled { opacity:0.55; cursor:not-allowed; }
        .ocw-list-row { display:flex; align-items:center; justify-content:space-between; padding:0.55rem 0.2rem; border-bottom:1px dashed var(--rule); font-size:0.88rem; }
        .ocw-list-row:last-child { border-bottom:none; }
        .ocw-tag { font-family:'IBM Plex Mono',monospace; background:var(--paper-dim); border:1px solid var(--rule); border-radius:4px; padding:0.1rem 0.4rem; font-size:0.75rem; color:var(--ink-soft); }
        .ocw-empty { padding:1.2rem; text-align:center; color:var(--ink-soft); font-size:0.85rem; border:1px dashed var(--rule-strong); border-radius:8px; }
        .ocw-item-row { display:grid; grid-template-columns:2.2fr 0.9fr 1fr 1fr 1fr auto; gap:0.5rem; align-items:end; padding:0.6rem 0; border-bottom:1px dashed var(--rule); }
        @media (max-width:900px){ .ocw-item-row{grid-template-columns:1fr 1fr;} }
        .ocw-doc { background:#FFFEF9; border:2px solid var(--ink); font-family:'IBM Plex Mono',monospace; font-size:0.82rem; color:var(--ink); }
        .ocw-doc .row { display:flex; border-bottom:1px solid var(--ink); }
        .ocw-doc .row:last-child { border-bottom:none; }
        .ocw-doc .cell { padding:0.45rem 0.6rem; }
        .ocw-doc .cell + .cell { border-left:1px solid var(--ink); }
        .ocw-doc .title { font-family:'Fraunces',serif; font-weight:700; font-size:1.15rem; text-align:center; padding:0.6rem; }
        .ocw-doc .subtitle { text-align:center; font-style:italic; font-family:'Fraunces',serif; font-size:0.95rem; padding:0.35rem; background:var(--paper-dim); }
        .ocw-doc .section-label { text-align:center; font-style:italic; font-family:'Fraunces',serif; padding:0.3rem; background:var(--paper-dim); }
        .ocw-doc b { font-weight:700; }
        .ocw-doc .grow { flex:1; }
        .ocw-doc .right { text-align:right; }
        .ocw-doc .item-table .row.head { font-weight:700; background:var(--paper-dim); }
        .ocw-doc .item-table .col-qtd { width:12%; text-align:center; }
        .ocw-doc .item-table .col-desc { flex:1; }
        .ocw-doc .item-table .col-preco { width:18%; text-align:right; }
        .ocw-doc .item-table .col-total { width:18%; text-align:right; }
        .ocw-doc .lote-row { font-style:italic; color:var(--ink-soft); }
        .ocw-doc .total-row { font-weight:700; }
        .ocw-preview-wrap { display:flex; justify-content:center; }
        .ocw-preview-wrap .ocw-doc { width:100%; max-width:640px; }
        .ocw-save-pill { font-size:0.78rem; font-family:'IBM Plex Mono',monospace; padding:0.3rem 0.6rem; border-radius:20px; background:var(--paper-dim); color:var(--ink-soft); }
        .ocw-save-pill.saved { background:#E4EDE0; color:var(--green-deep); }
        @media print {
        .ocw-header, .ocw-tabs, .ocw-noprint { display: none !important; }
        .ocw-root { padding: 0 !important; margin: 0 !important; min-height: 0 !important; }
        .ocw-body { padding: 0 !important; margin: 0 !important; }
        .ocw-nova-grid { display: block !important; gap: 0 !important; }
        .ocw-preview-wrap { display: block !important; }
        .ocw-print-area { width: 100% !important; padding: 0.2in; margin: 0 !important; }
        .ocw-doc { border-width: 2px; max-width: 100% !important; }
        @page { margin: 0.3in; }
      }
      `}</style>

      <header className="ocw-header">
        <h1>Ordem de Carregamento</h1>
        <div className="who">
          {session.user.email}
          {isAdmin && <span className="ocw-badge"><ShieldCheck size={11} style={{ verticalAlign: '-2px' }} /> ADMIN</span>}
          <button className="ocw-signout" onClick={signOut}><LogOut size={14} /> Sair</button>
        </div>
      </header>

      <nav className="ocw-tabs">
        {tabs.map(t => (
          <button key={t.key} className={`ocw-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </nav>

      <main className="ocw-body">
        {tab === 'caminhoes' && isAdmin && (
          <>
            <div className="ocw-card">
              <h2><Truck size={17} /> Novo caminhão</h2>
              <div className="ocw-grid g3">
                <div className="ocw-field"><label>Placa</label>
                  <input value={truckForm.placa} onChange={e => setTruckForm(f => ({ ...f, placa: e.target.value.toUpperCase() }))} placeholder="IMG 9527" /></div>
                <div className="ocw-field"><label>Motorista</label>
                  <input value={truckForm.motorista} onChange={e => setTruckForm(f => ({ ...f, motorista: e.target.value }))} placeholder="Sidnei" /></div>
                </div>
              <div style={{ marginTop: '0.8rem' }}>
                <button className="ocw-btn primary" onClick={addTruck}><Plus size={15} /> Adicionar caminhão</button>
              </div>
            </div>
            <div className="ocw-card">
              <h2>Caminhões cadastrados</h2>
              {trucks.length === 0 ? <div className="ocw-empty">Nenhum caminhão cadastrado ainda.</div> :
                trucks.map(t => (
                  <div className="ocw-list-row" key={t.id}>
                    <div><b>{t.placa}</b> — {t.motorista}</div>
                    <button className="ocw-btn danger" onClick={() => removeTruck(t.id)}><Trash2 size={15} /></button>
                  </div>
                ))}
            </div>
          </>
        )}

        {tab === 'produtos' && isAdmin && (
            <>
              <div className="ocw-card">
                <h2><Package size={17} /> Novo produto</h2>
                <div className="ocw-grid g3">
                  <div className="ocw-field"><label>Descrição</label>
                    <input value={productForm.descricao} onChange={e => setProductForm(f => ({ ...f, descricao: e.target.value }))} placeholder="ADUBO 5-25-25" /></div>
                  <div className="ocw-field"><label>Embalagem</label>
                    <select value={productForm.unidade} onChange={e => setProductForm(f => ({ ...f, unidade: e.target.value }))}>
                      <option value="Sacos 50kg">Sacos 50 kg</option>
                      <option value="Bags 1000kg">Bags 1000 kg</option>
                    </select></div>
                  <div className="ocw-field"><label>Espécie</label>
                    <select value={productForm.especie} onChange={e => setProductForm(f => ({ ...f, especie: e.target.value }))}>
                      <option value="ADUBO">Adubo</option>
                      <option value="UREIA">Ureia</option>
                      <option value="SEMENTE DE ARROZ">Semente de arroz</option>
                      <option value="SEMENTE DE SOJA">Semente de soja</option>
                    </select></div>
                </div>
                <div style={{ marginTop: '0.8rem' }}>
                  <button className="ocw-btn primary" onClick={addProduct}><Plus size={15} /> Adicionar produto</button>
                </div>
              </div>
              <div className="ocw-card">
                <h2>Produtos cadastrados</h2>
                {products.length === 0 ? <div className="ocw-empty">Nenhum produto cadastrado ainda.</div> :
                  products.map(p => (
                    <div className="ocw-list-row" key={p.id}>
                      <div><b>{p.especie} {p.descricao}</b> — {p.unidade}</div>
                      <button className="ocw-btn danger" onClick={() => removeProduct(p.id)}><Trash2 size={15} /></button>
                    </div>
                  ))}
              </div>
            </>
          )}

        {tab === 'historico' && (
          <div className="ocw-card">
            <h2><HistoryIcon size={17} /> Ordens salvas</h2>
            {orders.length === 0 ? <div className="ocw-empty">Nenhuma ordem salva ainda.</div> :
              orders.map(o => (
                <div className="ocw-list-row" key={o.id}>
                  <div><b>{dateBR(o.data_entrega)}</b> — {(o.produtores || []).map(p => p.nome).filter(Boolean).join(', ') || 'sem produtor'} <span className="ocw-tag">{o.total_sacos} sacos</span></div>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button className="ocw-btn ghost" onClick={() => loadOrderIntoForm(o)}>Ver / reimprimir</button>
                    {(isAdmin || o.created_by === session.user.id) &&
                      <button className="ocw-btn danger" onClick={() => deleteOrder(o.id)}><Trash2 size={15} /></button>}
                  </div>
                </div>
              ))}
          </div>
        )}

        {tab === 'nova' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '1.2rem' }} className="ocw-nova-grid">
            <style>{`@media (max-width:980px){ .ocw-nova-grid{ grid-template-columns:1fr !important; } }`}</style>
              <div className="ocw-noprint">
                <div className="ocw-card">
                  <h2><ClipboardList size={17} /> Dados da entrega</h2>
                  <div className="ocw-grid g3">
                    <div className="ocw-field"><label>Data da entrega</label>
                      <input type="date" value={order.dataEntrega} onChange={e => setOrder(o => ({ ...o, dataEntrega: e.target.value }))} /></div>
                    <div className="ocw-field"><label>Hora</label>
                      <input type="time" value={order.hora} onChange={e => setOrder(o => ({ ...o, hora: e.target.value }))} /></div>
                    <div className="ocw-field"><label>NF</label>
                      <input value={order.nf} onChange={e => setOrder(o => ({ ...o, nf: e.target.value }))} /></div>
                  </div>
                  <div className="ocw-grid g2" style={{ marginTop: '0.7rem' }}>
                    <div className="ocw-field"><label>Caminhão</label>
                      <select value={order.truckId} onChange={e => {
                        const truck = trucks.find(t => t.id === e.target.value);
                        setOrder(o => ({ ...o, truckId: e.target.value, motorista: truck?.motorista || '' }));
                      }}>
                        <option value="">Selecionar caminhão…</option>
                        {trucks.map(t => <option key={t.id} value={t.id}>{t.placa} — {t.motorista}</option>)}
                      </select></div>
                    <div className="ocw-field"><label>Transportadora (nº)</label>
                      <input value={order.transportadora} onChange={e => setOrder(o => ({ ...o, transportadora: e.target.value }))} /></div>
                  </div>
                  <div className="ocw-field" style={{ marginTop: '0.7rem' }}><label>Motorista (nesta viagem)</label>
                    <input value={order.motorista} onChange={e => setOrder(o => ({ ...o, motorista: e.target.value }))} placeholder="Sidnei" /></div>
                </div>






              <div className="ocw-card">
                <h2><ClipboardList size={17} /> Produtores e itens</h2>
                {produtoresComputed.map((p, idx) => (
                  <div key={p.id} style={{ border: '1px solid var(--rule)', borderRadius: 8, padding: '0.8rem', marginBottom: '0.9rem' }}>
                    <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'end', marginBottom: '0.7rem' }}>
                      <div className="ocw-field" style={{ flex: 1 }}>
                        <label>Produtor {idx + 1}</label>
                        <input value={p.nome} onChange={e => updateProdutorNome(p.id, e.target.value)} placeholder="Nome" />
                      </div>
                      {order.produtores.length > 1 &&
                        <button className="ocw-btn danger" onClick={() => removeProdutor(p.id)}><Trash2 size={16} /></button>}
                    </div>

                    {p.items.map(it => (
                      <div className="ocw-item-row" key={it.id}>
                        <div className="ocw-field"><label>Produto</label>
                          <select value={it.productId} onChange={e => updateItem(p.id, it.id, { productId: e.target.value })}>
                            <option value="">Selecionar…</option>
                            {products.map(pr => <option key={pr.id} value={pr.id}>{productLabel(pr)}</option>)}
                          </select></div>
                        <div className="ocw-field"><label>Quantidade</label>
                          <input type="number" value={it.quantidade} onChange={e => updateItem(p.id, it.id, { quantidade: e.target.value })} /></div>
                        <div className="ocw-field"><label>Preço unit. (R$)</label>
                          <input type="number" step="0.01" placeholder="0,00" value={it.precoOverride} onChange={e => updateItem(p.id, it.id, { precoOverride: e.target.value })} /></div>
                        <div className="ocw-field"><label>Lote</label>
                          <input value={it.lote} onChange={e => updateItem(p.id, it.id, { lote: e.target.value })} /></div>
                        <div className="ocw-field"><label>Total</label>
                          <div className="ocw-mono" style={{ padding: '0.5rem 0', fontWeight: 600 }}>R$ {brl(it.total)}</div></div>
                        <button className="ocw-btn danger" onClick={() => removeItem(p.id, it.id)}><X size={16} /></button>
                      </div>
                    ))}
                    <div style={{ marginTop: '0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <button className="ocw-btn ghost" onClick={() => addItem(p.id)}><Plus size={15} /> Adicionar item</button>
                      <span className="ocw-mono" style={{ fontSize: '0.8rem', color: 'var(--ink-soft)' }}>Subtotal: {p.subtotalSacos} sacos · R$ {brl(p.subtotalValor)}</span>
                    </div>
                  </div>
                ))}
                <button className="ocw-btn primary" onClick={addProdutor}><Plus size={15} /> Adicionar produtor</button>
              </div>







              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="ocw-btn primary" onClick={saveOrder} disabled={saveState === 'saving'}>
                  <Save size={15} /> Salvar ordem</button>
                <button className="ocw-btn amber" onClick={handlePrint}><Printer size={15} /> Imprimir / Salvar PDF</button>
                <button className="ocw-btn ghost" onClick={startNewOrder}>Nova ordem em branco</button>
                {saveState === 'saved' && <span className="ocw-save-pill saved">Salvo ✓</span>}
              </div>
            </div>

              <div className="ocw-preview-wrap ocw-print-area">
                  <div className="ocw-doc">
                    <div className="title">Ordem de Carregamento</div>
                    <div className="subtitle">Notas Fiscais de Saída</div>
                    <div className="row">
                      <div className="cell grow"><b>Data da Entrega:</b> {dateBR(order.dataEntrega)}</div>
                      <div className="cell"><b>Hora:</b> {order.hora || '____'}</div>
                      <div className="cell"><b>NF:</b> {order.nf}</div>
                    </div>
                    <div className="row">
                      <div className="cell"><b>Transp.:</b> {order.transportadora}</div>
                      <div className="cell grow"><b>Placa:</b> {selectedTruck?.placa || '—'}</div>
                      <div className="cell grow"><b>Motorista:</b> {order.motorista || '—'}</div>
                    </div>

                    <div className="row">
                      <div className="cell grow"><b>Quantidade:</b> {totalSacos} sacos</div>
                    </div>

                    <div className="section-label">Itens por produtor</div>
                    {produtoresComputed.filter(p => p.nome).map(p => (
                      <React.Fragment key={p.id}>
                        <div className="row" style={{ background: 'var(--paper-dim)' }}>
                          <div className="cell grow"><b>{p.nome}</b></div>
                        </div>
                        <div className="row head">
                          <div className="cell col-qtd">Quant.</div>
                          <div className="cell col-desc">Descrição:</div>
                          <div className="cell col-preco">Preço Unitário:</div>
                          <div className="cell col-total">Valor Total:</div>
                        </div>
                        {p.items.filter(it => it.productId).map(it => (
                          <React.Fragment key={it.id}>
                            <div className="row">
                              <div className="cell col-qtd">{it.quantidade || 0}</div>
                              <div className="cell col-desc">{productLabel(it.prod)}</div>
                              <div className="cell col-preco">R$ {brl(it.preco)}</div>
                              <div className="cell col-total"><b>R$ {brl(it.total)}</b></div>
                            </div>
                            <div className="row lote-row"><div className="cell grow">Lote: {it.lote}</div></div>
                          </React.Fragment>
                        ))}
                        <div className="row">
                          <div className="cell grow right">Subtotal {p.nome}:</div>
                          <div className="cell">{p.subtotalSacos} sacos — R$ {brl(p.subtotalValor)}</div>
                        </div>
                      </React.Fragment>
                    ))}
                    <div className="row total-row"><div className="cell grow right">Quant. Total Sacos:</div><div className="cell">{totalSacos}</div></div>
                    <div className="row total-row"><div className="cell grow right">Valor Total Geral:</div><div className="cell">R$ {brl(totalValor)}</div></div>
                  </div>
                </div> 
                </div>
        )}
      </main>
    </div>
  );
}

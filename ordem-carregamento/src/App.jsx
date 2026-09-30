import React, { useState, useEffect, useMemo, useRef, useId } from 'react';
import {
  Truck, Package, FilePlus, History as HistoryIcon, Printer,
  Trash2, Plus, Save, ClipboardList, LogOut, X, ShieldCheck
} from 'lucide-react';
import { supabase } from './supabaseClient';
import Auth from './Auth';

const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateBR = (iso) => { if (!iso) return '____.____.______'; const [y, m, d] = iso.split('-'); return `${d}.${m}.${y}`; };
const dateHoraBR = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};
const criadorLabel = (profiles, userId) => {
  const email = profiles.find(p => p.id === userId)?.email;
  if (!email) return '—';
  const nome = email.split('@')[0];
  return nome.charAt(0).toUpperCase() + nome.slice(1);
};
const orderTipoLabel = (o) => {
  const totals = (o.produtores || []).reduce((acc, p) => {
    (p.items || []).forEach(it => {
      const tipo = formatEmbalagem(it.unidade);
      acc[tipo] = (acc[tipo] || 0) + (Number(it.quantidade) || 0);
    });
    return acc;
  }, {});
  const entries = Object.entries(totals);
  return entries.length ? entries.map(([tipo, qtd]) => `${qtd} ${tipo}`).join(' e ') : `${o.total_sacos} sacos`;
};
const productLabel = (p) => p ? `${p.especie} ${p.descricao} — ${p.unidade}` : '';
const formatEmbalagem = (unidade) => {
  if (!unidade) return 'sacos';
  const peso = (unidade.match(/(\d+)\s*kg/i) || [])[1];
  const tipo = unidade.toLowerCase().includes('bag') ? 'bags' : 'sacos';
  return peso ? `${tipo} de ${peso}kg` : tipo;
};

const POR_PAGINA = 20; // cargas entregues carregadas por vez no histórico

const blankOrder = () => ({
  id: null, status: 'agendada',
  dataEntrega: '', hora: '', nf: '', transportadora: '1',
  truckId: '', motorista: '',
  produtores: [{ id: 1, nome: '', items: [{ id: 1, productId: '', quantidade: '', precoOverride: '', pagamento: '' }] }],
});

function Aviso({ texto, children }) {
  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif', maxWidth: 520 }}>
      <p style={{ margin: '0 0 1rem', lineHeight: 1.5 }}>{texto}</p>
      {children && <div style={{ display: 'flex', gap: '0.5rem' }}>{children}</div>}
    </div>
  );
}

const avisoBtn = {
  padding: '0.5rem 0.9rem', borderRadius: 7, border: '1px solid #A79A76',
  background: '#F6F2E7', cursor: 'pointer', fontSize: '0.85rem',
};

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading, null = logged out
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setProfile(null); setProfileError(''); return; }
    let cancelado = false;
    setProfileError('');
    // O perfil é criado por um trigger no Supabase logo após o cadastro, e pode
    // levar um instante para aparecer. Tentamos algumas vezes antes de desistir,
    // em vez de deixar a tela parada para sempre.
    const buscarPerfil = async (tentativa = 0) => {
      const { data, error } = await supabase
        .from('profiles').select('*').eq('id', session.user.id).maybeSingle();
      if (cancelado) return;
      if (data) { setProfile(data); return; }
      if (tentativa < 5) { setTimeout(() => buscarPerfil(tentativa + 1), 800); return; }
      setProfileError(error?.message || 'seu perfil ainda não foi criado no banco de dados.');
    };
    buscarPerfil();
    return () => { cancelado = true; };
  }, [session]);

  if (session === undefined) return <Aviso texto="Carregando…" />;
  if (!session) return <Auth />;
  if (profileError) return (
    <Aviso texto={`Não foi possível carregar seu perfil: ${profileError}`}>
      <button style={avisoBtn} onClick={() => window.location.reload()}>Tentar de novo</button>
      <button style={avisoBtn} onClick={() => supabase.auth.signOut()}>Sair</button>
    </Aviso>
  );
  if (!profile) return <Aviso texto="Preparando sua conta…" />;

  return <Main session={session} profile={profile} />;
}

function ProductPicker({ products, value, onChange }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [destacado, setDestacado] = useState(0);
  const listaRef = useRef(null);
  const idBase = useId();

  const selected = products.find(p => p.id === value);
  const filtered = useMemo(
    () => products.filter(p => productLabel(p).toLowerCase().includes(query.toLowerCase())),
    [products, query],
  );

  // Digitar muda a lista debaixo do destaque. Sem isto, o Enter selecionaria
  // um item que já não está mais naquela posição.
  useEffect(() => { setDestacado(0); }, [query, open]);

  // Mantém à vista o item destacado enquanto se percorre com as setas.
  useEffect(() => {
    if (!open || !listaRef.current) return;
    listaRef.current.querySelector(`[data-indice="${destacado}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [destacado, open]);

  const escolher = (p) => { onChange(p.id); setOpen(false); };

  // Abrir sempre começa de busca limpa. Sem isto, reabrir depois de escolher um
  // produto traria de volta o texto digitado da vez anterior, já filtrando a lista.
  const abrir = () => { setQuery(''); setOpen(true); };

  const aoTeclar = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { abrir(); return; }
      if (filtered.length === 0) return;
      const passo = e.key === 'ArrowDown' ? 1 : -1;
      setDestacado(i => (i + passo + filtered.length) % filtered.length); // dá a volta nas pontas
      return;
    }
    if (e.key === 'Enter') {
      if (!open || !filtered[destacado]) return;
      e.preventDefault();
      escolher(filtered[destacado]);
      return;
    }
    if (e.key === 'Escape' && open) { e.preventDefault(); setOpen(false); }
  };

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={open ? query : (selected ? productLabel(selected) : '')}
        onFocus={abrir}
        // onFocus não dispara quando o campo já está focado — sem este onClick,
        // clicar de novo depois de escolher um produto não reabriria a lista.
        onClick={() => { if (!open) abrir(); }}
        onChange={e => setQuery(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={aoTeclar}
        placeholder="Buscar produto…"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${idBase}-lista`}
        aria-autocomplete="list"
        aria-activedescendant={open && filtered[destacado] ? `${idBase}-op-${destacado}` : undefined}
      />
      {open && (
        <div
          id={`${idBase}-lista`}
          ref={listaRef}
          role="listbox"
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
            background: '#FDFBF5', border: '1px solid var(--rule-strong)', borderRadius: 6,
            maxHeight: 220, overflowY: 'auto', marginTop: 2, boxShadow: '0 4px 10px rgba(0,0,0,0.12)',
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: '0.55rem 0.6rem', fontSize: '0.82rem', color: 'var(--ink-soft)' }}>Nenhum produto encontrado</div>
          ) : (
            <>
              {filtered.map((p, i) => (
                <div
                  key={p.id}
                  id={`${idBase}-op-${i}`}
                  data-indice={i}
                  role="option"
                  aria-selected={i === destacado}
                  onMouseDown={() => escolher(p)}
                  // o mouse move o mesmo destaque que as setas, para os dois não brigarem
                  onMouseEnter={() => setDestacado(i)}
                  style={{
                    padding: '0.5rem 0.6rem', fontSize: '0.85rem', cursor: 'pointer',
                    background: i === destacado ? 'var(--paper-dim)' : 'transparent',
                  }}
                >
                  {productLabel(p)}
                </div>
              ))}
              <div style={{
                position: 'sticky', bottom: 0, padding: '0.35rem 0.6rem',
                background: 'var(--paper-dim)', borderTop: '1px solid var(--rule)',
                fontSize: '0.68rem', color: 'var(--ink-soft)', letterSpacing: '0.02em',
              }}>
                ↑↓ navegar · Enter selecionar · Esc fechar
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Main({ session, profile }) {
  const isAdmin = profile.role === 'admin';
  const [tab, setTab] = useState('nova');
  const [trucks, setTrucks] = useState([]);
  const [products, setProducts] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [order, setOrder] = useState(blankOrder());
  const [saveState, setSaveState] = useState('idle');
  const [filtroCaminhao, setFiltroCaminhao] = useState('');
  const [filtroDataDe, setFiltroDataDe] = useState('');
  const [filtroDataAte, setFiltroDataAte] = useState('');

  // As agendadas são a fila de trabalho: poucas, e todas precisam estar à vista.
  // As entregues são o arquivo, que só cresce — essas vêm por página.
  const [agendadas, setAgendadas] = useState([]);
  const [entregues, setEntregues] = useState([]);
  const [entreguesTotal, setEntreguesTotal] = useState(0);
  const [pagina, setPagina] = useState(0);
  const [carregandoEntregues, setCarregandoEntregues] = useState(false);
  const [aviso, setAviso] = useState(null); // { tipo: 'erro' | 'ok', texto }

  const notificar = (tipo, texto) => setAviso({ tipo, texto, em: Date.now() });
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), aviso.tipo === 'erro' ? 8000 : 3000);
    return () => clearTimeout(t);
  }, [aviso]);

  // Traduz os erros mais comuns do Postgres/Supabase para algo acionável.
  const explicarErro = (error) => {
    if (!error) return 'erro desconhecido.';
    if (error.code === '23503') return 'este registro está sendo usado por uma ordem e não pode ser removido.';
    if (error.code === '42501') return 'você não tem permissão para isso.';
    if (error.code === 'PGRST204') return `o banco não tem uma coluna que o site espera (${error.message}). Rode o migracao.sql no Supabase.`;
    return error.message || 'erro desconhecido.';
  };

  const tabs = [
    { key: 'nova', label: 'Nova Ordem', icon: FilePlus },
    ...(isAdmin ? [
      { key: 'caminhoes', label: 'Caminhões', icon: Truck },
      { key: 'produtos', label: 'Produtos', icon: Package },
    ] : []),
    { key: 'historico', label: 'Histórico', icon: HistoryIcon },
  ];

  // Os filtros são aplicados no banco, não na lista já carregada: com paginação,
  // filtrar no cliente só procuraria dentro da página aberta — pior que antes.
  const carregarEntregues = async (paginaAlvo = pagina) => {
    setCarregandoEntregues(true);
    let q = supabase.from('orders').select('*', { count: 'exact' }).eq('status', 'entregue');
    if (filtroCaminhao) q = q.eq('truck_id', filtroCaminhao);
    if (filtroDataDe) q = q.gte('data_entrega', filtroDataDe);
    if (filtroDataAte) q = q.lte('data_entrega', filtroDataAte);

    const { data, count, error } = await q
      .order('data_entrega', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(paginaAlvo * POR_PAGINA, paginaAlvo * POR_PAGINA + POR_PAGINA - 1);

    setCarregandoEntregues(false);
    if (error) return notificar('erro', `Não foi possível carregar as cargas entregues: ${explicarErro(error)}`);

    // Apagar o último item de uma página deixaria a tela vazia sem motivo aparente.
    if ((data || []).length === 0 && paginaAlvo > 0) { setPagina(paginaAlvo - 1); return; }

    setEntregues(data || []);
    setEntreguesTotal(count || 0);
  };

  const loadAll = async () => {
    const [rt, rp, ra, rpf] = await Promise.all([
      supabase.from('trucks').select('*').order('placa'),
      supabase.from('products').select('*').order('descricao'),
      supabase.from('orders').select('*').eq('status', 'agendada').order('data_entrega', { ascending: true, nullsFirst: false }),
      supabase.from('profiles').select('id, email'),
    ]);
    const falhou = [rt, rp, ra, rpf].find(r => r.error);
    if (falhou) notificar('erro', `Não foi possível carregar os dados: ${explicarErro(falhou.error)}`);
    setTrucks(rt.data || []); setProducts(rp.data || []);
    setAgendadas(ra.data || []); setProfiles(rpf.data || []);
    await carregarEntregues();
  };
  useEffect(() => { loadAll(); }, []);

  // Recarrega o arquivo quando o usuário troca de página ou mexe nos filtros.
  // O loadAll acima já traz a primeira página, então pulamos a execução inicial.
  const jaMontou = useRef(false);
  useEffect(() => {
    if (!jaMontou.current) { jaMontou.current = true; return; }
    carregarEntregues();
  }, [pagina, filtroCaminhao, filtroDataDe, filtroDataAte]);

  // ---- Caminhões ----
  const [truckForm, setTruckForm] = useState({ placa: '', motorista: ''});
  const addTruck = async () => {
    if (!truckForm.placa.trim() || !truckForm.motorista.trim()) {
      return notificar('erro', 'Preencha a placa e o motorista.');
    }
    const { error } = await supabase.from('trucks').insert({
      placa: truckForm.placa.trim(), motorista: truckForm.motorista.trim(),
    });
    if (error) return notificar('erro', `Não foi possível cadastrar o caminhão: ${explicarErro(error)}`);
    setTruckForm({ placa: '', motorista: '' });
    notificar('ok', 'Caminhão cadastrado.');
    loadAll();
  };
  const removeTruck = async (t) => {
    if (!window.confirm(`Remover o caminhão ${t.placa} — ${t.motorista}?`)) return;
    const { error } = await supabase.from('trucks').delete().eq('id', t.id);
    if (error) return notificar('erro', `Não foi possível remover o caminhão: ${explicarErro(error)}`);
    notificar('ok', 'Caminhão removido.');
    loadAll();
  };

  // ---- Produtos ----
  // 'FERTILIZANTE' e não 'ADUBO': o valor inicial precisa ser um dos <option>
  // abaixo, senão o select abre em branco e salva uma espécie que não existe na lista.
  const produtoVazio = { descricao: '', unidade: 'Sacos 50kg', especie: 'FERTILIZANTE' };
  const [productForm, setProductForm] = useState(produtoVazio);
  const addProduct = async () => {
    if (!productForm.descricao.trim()) return notificar('erro', 'Preencha a descrição do produto.');
    const { error } = await supabase.from('products').insert({
      descricao: productForm.descricao.trim(), unidade: productForm.unidade, especie: productForm.especie,
    });
    if (error) return notificar('erro', `Não foi possível cadastrar o produto: ${explicarErro(error)}`);
    setProductForm(produtoVazio);
    notificar('ok', 'Produto cadastrado.');
    loadAll();
  };
  const removeProduct = async (p) => {
    if (!window.confirm(`Remover o produto ${p.especie} ${p.descricao}?\n\nAs ordens já salvas continuam mostrando este item normalmente.`)) return;
    const { error } = await supabase.from('products').delete().eq('id', p.id);
    if (error) return notificar('erro', `Não foi possível remover o produto: ${explicarErro(error)}`);
    notificar('ok', 'Produto removido.');
    loadAll();
  };

  // ---- Ordem ----
  const updateItem = (pid, itemId, patch) =>
  setOrder(o => ({ ...o, produtores: o.produtores.map(p => p.id === pid ? { ...p, items: p.items.map(it => it.id === itemId ? { ...it, ...patch } : it) } : p) }));
  const addItem = (pid) =>
    setOrder(o => ({ ...o, produtores: o.produtores.map(p => p.id === pid ? { ...p, items: [...p.items, { id: Date.now(), productId: '', quantidade: '', precoOverride: '', pagamento: '' }] } : p) }));
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
    const subtotalPorTipo = items.reduce((acc, it) => {
      if (!it.productId) return acc;
      const tipo = formatEmbalagem(it.prod?.unidade);
      acc[tipo] = (acc[tipo] || 0) + (Number(it.quantidade) || 0);
      return acc;
    }, {});
    const subtotalPorTipoLabel = Object.entries(subtotalPorTipo).map(([tipo, qtd]) => `${qtd} ${tipo}`).join(' e ') || '0 sacos';
    return { ...p, items, subtotalSacos, subtotalValor, subtotalPorTipoLabel };
  }), [order.produtores, products]);

  const totalSacos = produtoresComputed.reduce((s, p) => s + p.subtotalSacos, 0);
  const totalValor = produtoresComputed.reduce((s, p) => s + p.subtotalValor, 0);

  const totalPorTipo = produtoresComputed.reduce((acc, p) => {
  p.items.forEach(it => {
    if (!it.productId) return;
    const tipo = formatEmbalagem(it.prod?.unidade);
    acc[tipo] = (acc[tipo] || 0) + (Number(it.quantidade) || 0);
    });
    return acc;
    }, {});
  const totalPorTipoLabel = Object.entries(totalPorTipo).map(([tipo, qtd]) => `${qtd} ${tipo}`).join(' e ') || '0 sacos';
  const updateProdutorNome = (pid, nome) =>
  setOrder(o => ({ ...o, produtores: o.produtores.map(p => p.id === pid ? { ...p, nome } : p) }));
  const addProdutor = () =>
    setOrder(o => ({ ...o, produtores: [...o.produtores, { id: Date.now(), nome: '', items: [{ id: Date.now() + 1, productId: '', quantidade: '', precoOverride: '', pagamento: '' }] }] }));
  const removeProdutor = (pid) =>
    setOrder(o => ({ ...o, produtores: o.produtores.filter(p => p.id !== pid) }));

const saveOrder = async () => {
    // Produtor sem nome é descartado na hora de salvar e no PDF. Antes isso
    // acontecia em silêncio; agora avisamos em vez de perder os itens.
    const semNome = produtoresComputed.find(p => !(p.nome || '').trim() && p.items.some(it => it.productId));
    if (semNome) {
      return notificar('erro', 'Há itens lançados num produtor sem nome. Preencha o nome — senão esses itens não são salvos nem saem no PDF.');
    }

    const produtores = produtoresComputed.filter(p => (p.nome || '').trim()).map(p => ({
      nome: p.nome.trim(),
      items: p.items.filter(it => it.productId).map(it => ({
        productId: it.productId, descricao: it.prod?.descricao, unidade: it.prod?.unidade, quantidade: Number(it.quantidade) || 0,
        preco: it.preco, total: it.total, pagamento: it.pagamento,
      })),
      subtotalSacos: p.subtotalSacos, subtotalValor: p.subtotalValor,
    }));

    if (produtores.length === 0) return notificar('erro', 'Informe ao menos um produtor com nome.');
    if (!produtores.some(p => p.items.length)) return notificar('erro', 'Adicione ao menos um item à ordem.');

    setSaveState('saving');
    const payload = {
      data_entrega: order.dataEntrega || null,
      hora: order.hora || null,
      nf: order.nf, transportadora: order.transportadora, truck_id: order.truckId || null, motorista: order.motorista,
      produtores,
      total_sacos: totalSacos, total_valor: totalValor, status: order.status || 'agendada',
    };

    if (order.id) {
      const { data, error } = await supabase.from('orders').update(payload).eq('id', order.id).select();
      if (error) { setSaveState('idle'); return notificar('erro', `Não foi possível atualizar a ordem: ${explicarErro(error)}`); }
      // Um update barrado por RLS não devolve erro: ele simplesmente não altera
      // nenhuma linha. Sem o .select() abaixo o site mostrava "Salvo ✓" sem ter
      // gravado nada. É por isso que "Marcar como entregue" parecia funcionar.
      if (!data || data.length === 0) {
        setSaveState('idle');
        return notificar('erro', 'Nada foi gravado. A ordem pode ter sido apagada por outra pessoa, ou o banco ainda não tem a policy de UPDATE (rode o migracao.sql no Supabase).');
      }
    } else {
      const { data, error } = await supabase.from('orders')
        .insert({ ...payload, created_by: session.user.id }).select().single();
      if (error) { setSaveState('idle'); return notificar('erro', `Não foi possível salvar a ordem: ${explicarErro(error)}`); }
      setOrder(o => ({ ...o, id: data.id }));
    }

    await loadAll();
    setSaveState('saved');
    setTimeout(() => setSaveState('idle'), 1800);
  };

  // Um update barrado por RLS devolve sucesso com zero linhas alteradas, então
  // conferimos o retorno em vez de confiar apenas na ausência de erro.
  const atualizarOrdem = async (id, patch, rotulo) => {
    const { data, error } = await supabase.from('orders').update(patch).eq('id', id).select();
    if (error) { notificar('erro', `Não foi possível ${rotulo}: ${explicarErro(error)}`); return false; }
    if (!data || data.length === 0) {
      notificar('erro', `Não foi possível ${rotulo}: nenhuma linha foi alterada. Verifique se o migracao.sql já foi rodado no Supabase.`);
      return false;
    }
    await loadAll();
    return true;
  };

  const deleteOrder = async (o) => {
    const quem = (o.produtores || []).map(p => p.nome).filter(Boolean).join(', ') || 'sem produtor';
    if (!window.confirm(`Apagar a ordem de ${dateBR(o.data_entrega)} (${quem})?\n\nIsso não pode ser desfeito.`)) return;
    const { error } = await supabase.from('orders').delete().eq('id', o.id);
    if (error) return notificar('erro', `Não foi possível apagar a ordem: ${explicarErro(error)}`);
    if (order.id === o.id) setOrder(blankOrder());
    notificar('ok', 'Ordem apagada.');
    loadAll();
  };

  const markAsDelivered = async (id) => {
    const ok = await atualizarOrdem(id, {
      status: 'entregue',
      entregue_por: session.user.id,
      entregue_em: new Date().toISOString(),
    }, 'marcar como entregue');
    if (ok) notificar('ok', 'Carga marcada como entregue.');
  };

  const reopenOrder = async (id) => {
    if (!window.confirm('Voltar esta carga para "agendada"?')) return;
    const ok = await atualizarOrdem(id, { status: 'agendada', entregue_por: null, entregue_em: null }, 'reabrir a carga');
    if (ok) notificar('ok', 'Carga voltou para agendada.');
  };
  const loadOrderIntoForm = (o) => {
    setOrder({
      id: o.id, status: o.status || 'agendada',
      dataEntrega: o.data_entrega || '', hora: o.hora || '', nf: o.nf || '', transportadora: o.transportadora || '1',
      truckId: o.truck_id || '', motorista: o.motorista || '',
      produtores: (o.produtores && o.produtores.length ? o.produtores : [{ nome: '', items: [] }]).map((p, i) => ({
        id: i + 1,
        nome: p.nome,
        items: (p.items || []).map((it, j) => ({ id: j + 1, productId: it.productId, quantidade: it.quantidade, precoOverride: it.preco ? String(it.preco) : '', pagamento: it.pagamento ?? it.lote ?? '' })),
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
        .ocw-doc {
          background:#FFFEF9; border:2px solid var(--ink); font-family:'IBM Plex Mono',monospace; font-size:0.82rem; color:var(--ink);
          box-decoration-break: clone;
          -webkit-box-decoration-break: clone;
        }
        .ocw-doc .row { display:flex; border-bottom:1px solid var(--ink); }
        .ocw-doc .row:last-child { border-bottom:none; }
        .ocw-doc .cell { padding:0.45rem 0.6rem; min-width:0; }
        .ocw-doc .cell + .cell { border-left:1px solid var(--ink); }
        .ocw-doc .title { font-family:'Fraunces',serif; font-weight:700; font-size:1.15rem; text-align:center; padding:0.6rem; }
        .ocw-doc .subtitle { text-align:center; font-style:italic; font-family:'Fraunces',serif; font-size:0.95rem; padding:0.35rem; background:var(--paper-dim); }
        .ocw-doc .section-label { text-align:center; font-style:italic; font-family:'Fraunces',serif; padding:0.3rem; background:var(--paper-dim); }
        .ocw-doc b { font-weight:700; }
        .ocw-doc .grow { flex:1; }
        .ocw-doc .right { text-align:right; }
        .ocw-doc .row.head { font-weight:700; background:var(--paper-dim); }
        .ocw-doc .col-qtd { flex: 0 0 15%; text-align:center; }
        .ocw-doc .col-desc { flex: 1 1 auto; min-width:0; }
        .ocw-doc .col-preco { flex: 0 0 21%; text-align:right; }
        .ocw-doc .col-total { flex: 0 0 21%; text-align:right; }
        .ocw-doc .total-row { font-weight:700; }
        .ocw-preview-wrap { display:flex; justify-content:center; }
        .ocw-preview-wrap .ocw-doc { width:100%; max-width:640px; }
        .ocw-save-pill { font-size:0.78rem; font-family:'IBM Plex Mono',monospace; padding:0.3rem 0.6rem; border-radius:20px; background:var(--paper-dim); color:var(--ink-soft); }
        .ocw-save-pill.saved { background:#E4EDE0; color:var(--green-deep); }
        .ocw-pager { display:flex; align-items:center; justify-content:space-between; gap:0.7rem; flex-wrap:wrap; padding-top:0.9rem; margin-top:0.4rem; border-top:1px solid var(--rule); font-size:0.8rem; color:var(--ink-soft); }
        .ocw-aviso { position:fixed; left:50%; transform:translateX(-50%); bottom:1.2rem; z-index:100; width:min(560px,92vw); padding:0.75rem 0.9rem; border-radius:9px; font-size:0.85rem; line-height:1.45; box-shadow:0 6px 20px rgba(0,0,0,0.18); display:flex; gap:0.7rem; align-items:flex-start; }
        .ocw-aviso.erro { background:#FBE9E6; border:1px solid var(--danger); color:#6E2A20; }
        .ocw-aviso.ok { background:#E4EDE0; border:1px solid var(--green); color:var(--green-deep); }
        .ocw-aviso button { background:none; border:none; cursor:pointer; color:inherit; padding:0; line-height:1; flex-shrink:0; }
        @media print {
        .ocw-header, .ocw-tabs, .ocw-noprint, .ocw-aviso { display: none !important; }
        .ocw-root { padding: 0 !important; margin: 0 !important; min-height: 0 !important; }
        .ocw-body { padding: 0 !important; margin: 0 !important; }
        .ocw-nova-grid { display: block !important; gap: 0 !important; }
        .ocw-preview-wrap { display: block !important; }
        .ocw-print-area { width: 100% !important; padding: 0.2in; margin: 0 !important; }
        .ocw-doc { border-width: 2px; max-width: 100% !important; }
        .produtor-block { break-inside: avoid; page-break-inside: avoid; }
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
                <div className="ocw-field">
                  <label>Placa</label>
                  <input
                    value={truckForm.placa}
                    onChange={e => setTruckForm(f => ({ ...f, placa: e.target.value.toUpperCase() }))}
                    placeholder="IMG 9527"
                  />
                </div>
                <div className="ocw-field">
                  <label>Motorista</label>
                  <input
                    value={truckForm.motorista}
                    onChange={e => setTruckForm(f => ({ ...f, motorista: e.target.value }))}
                    placeholder="Sidnei"
                  />
                </div>
              </div>
              <div style={{ marginTop: '0.8rem' }}>
                <button className="ocw-btn primary" onClick={addTruck}><Plus size={15} /> Adicionar caminhão</button>
              </div>
            </div>

            <div className="ocw-card">
              <h2>Caminhões cadastrados</h2>
              {trucks.length === 0 ? (
                <div className="ocw-empty">Nenhum caminhão cadastrado ainda.</div>
              ) : (
                trucks.map(t => (
                  <div className="ocw-list-row" key={t.id}>
                    <div><b>{t.placa}</b> — {t.motorista}</div>
                    <button className="ocw-btn danger" onClick={() => removeTruck(t)}><Trash2 size={15} /></button>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {tab === 'produtos' && isAdmin && (
          <>
            <div className="ocw-card">
              <h2><Package size={17} /> Novo produto</h2>
              <div className="ocw-grid g3">
                <div className="ocw-field">
                  <label>Descrição</label>
                  <input
                    value={productForm.descricao}
                    onChange={e => setProductForm(f => ({ ...f, descricao: e.target.value }))}
                    placeholder="Item "
                  />
                </div>
                <div className="ocw-field">
                  <label>Embalagem</label>
                  <select value={productForm.unidade} onChange={e => setProductForm(f => ({ ...f, unidade: e.target.value }))}>
                    <option value="Sacos 25kg">Sacos 25 kg</option>
                    <option value="Sacos 40kg">Sacos 40 kg</option>
                    <option value="Sacos 50kg">Sacos 50 kg</option>
                    <option value="Bags 500kg">Bags 500 kg</option>
                    <option value="Bags 800kg">Bags 800 kg</option>
                    <option value="Bags 1000kg">Bags 1000 kg</option>
                    <option value="Bags 700kg">Bags 700 kg (Bolsa Branca)</option>
                  </select>
                </div>
                <div className="ocw-field">
                  <label>Espécie</label>
                  <select value={productForm.especie} onChange={e => setProductForm(f => ({ ...f, especie: e.target.value }))}>
                    <option value="FERTILIZANTE">Fertilizante</option>
                    <option value="SEMENTE DE ARROZ">Semente de arroz</option>
                    <option value="SEMENTE DE SOJA">Semente de soja</option>
                  </select>
                </div>
              </div>
              <div style={{ marginTop: '0.8rem' }}>
                <button className="ocw-btn primary" onClick={addProduct}><Plus size={15} /> Adicionar produto</button>
              </div>
            </div>

            <div className="ocw-card">
              <h2>Produtos cadastrados</h2>
              {products.length === 0 ? (
                <div className="ocw-empty">Nenhum produto cadastrado ainda.</div>
              ) : (
                products.map(p => (
                  <div className="ocw-list-row" key={p.id}>
                    <div><b>{p.especie} {p.descricao}</b> — {p.unidade}</div>
                    <button className="ocw-btn danger" onClick={() => removeProduct(p)}><Trash2 size={15} /></button>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {tab === 'historico' && (
          <>
            <div className="ocw-card">
              <h2><HistoryIcon size={17} /> Cargas agendadas</h2>
              {agendadas.length === 0 ? (
                <div className="ocw-empty">Nenhuma carga agendada.</div>
              ) : (
                agendadas.map(o => (
                  <div className="ocw-list-row" key={o.id}>
                    <div>
                      <b>{dateBR(o.data_entrega)}</b> — {(o.produtores || []).map(p => p.nome).filter(Boolean).join(', ') || 'sem produtor'}{' '}
                      <span className="ocw-tag">{orderTipoLabel(o)}</span>{' '}
                      <span className="ocw-tag">por {criadorLabel(profiles, o.created_by)}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button className="ocw-btn ghost" onClick={() => loadOrderIntoForm(o)}>Ver / reimprimir</button>
                      <button className="ocw-btn primary" onClick={() => markAsDelivered(o.id)}>Marcar como entregue</button>
                      <button className="ocw-btn danger" onClick={() => deleteOrder(o)}><Trash2 size={15} /></button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="ocw-card">
              <h2><HistoryIcon size={17} /> Cargas entregues</h2>
              <div className="ocw-grid g2" style={{ marginBottom: '0.9rem' }}>
                <div className="ocw-field">
                  <label>Filtrar por caminhão</label>
                  <select value={filtroCaminhao} onChange={e => { setFiltroCaminhao(e.target.value); setPagina(0); }}>
                    <option value="">Todos</option>
                    {trucks.map(t => <option key={t.id} value={t.id}>{t.placa} — {t.motorista}</option>)}
                  </select>
                </div>
                <div className="ocw-grid g2">
                  <div className="ocw-field">
                    <label>De</label>
                    <input type="date" value={filtroDataDe} onChange={e => { setFiltroDataDe(e.target.value); setPagina(0); }} />
                  </div>
                  <div className="ocw-field">
                    <label>Até</label>
                    <input type="date" value={filtroDataAte} onChange={e => { setFiltroDataAte(e.target.value); setPagina(0); }} />
                  </div>
                </div>
              </div>

              {(filtroCaminhao || filtroDataDe || filtroDataAte) && (
                <div style={{ marginBottom: '0.7rem' }}>
                  <button className="ocw-btn ghost" onClick={() => { setFiltroCaminhao(''); setFiltroDataDe(''); setFiltroDataAte(''); setPagina(0); }}>
                    <X size={15} /> Limpar filtros
                  </button>
                </div>
              )}

              {carregandoEntregues ? (
                <div className="ocw-empty">Carregando…</div>
              ) : entregues.length === 0 ? (
                <div className="ocw-empty">Nenhuma carga entregue encontrada.</div>
              ) : (
                entregues.map(o => (
                  <div className="ocw-list-row" key={o.id}>
                    <div>
                      <b>{dateBR(o.data_entrega)}</b> — {(o.produtores || []).map(p => p.nome).filter(Boolean).join(', ') || 'sem produtor'}{' '}
                      <span className="ocw-tag">{trucks.find(t => t.id === o.truck_id)?.placa || '—'}</span>{' '}
                      <span className="ocw-tag">{orderTipoLabel(o)}</span>{' '}
                      <span className="ocw-tag">por {criadorLabel(profiles, o.created_by)}</span>{' '}
                      {o.entregue_por && (
                        <span className="ocw-tag">entregue por {criadorLabel(profiles, o.entregue_por)}{o.entregue_em ? ` em ${dateHoraBR(o.entregue_em)}` : ''}</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button className="ocw-btn ghost" onClick={() => loadOrderIntoForm(o)}>Ver / reimprimir</button>
                      <button className="ocw-btn ghost" onClick={() => reopenOrder(o.id)}>Reabrir</button>
                      <button className="ocw-btn danger" onClick={() => deleteOrder(o)}><Trash2 size={15} /></button>
                    </div>
                  </div>
                ))
              )}

              {entreguesTotal > 0 && (
                <div className="ocw-pager">
                  <span className="ocw-mono">
                    {pagina * POR_PAGINA + 1}–{Math.min((pagina + 1) * POR_PAGINA, entreguesTotal)} de {entreguesTotal} carga{entreguesTotal === 1 ? '' : 's'}
                  </span>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button
                      className="ocw-btn ghost"
                      disabled={pagina === 0 || carregandoEntregues}
                      onClick={() => setPagina(p => Math.max(0, p - 1))}
                    >Anterior</button>
                    <button
                      className="ocw-btn ghost"
                      disabled={(pagina + 1) * POR_PAGINA >= entreguesTotal || carregandoEntregues}
                      onClick={() => setPagina(p => p + 1)}
                    >Próxima</button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'nova' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '1.2rem' }} className="ocw-nova-grid">
            <style>{`@media (max-width:980px){ .ocw-nova-grid{ grid-template-columns:1fr !important; } }`}</style>

            <div className="ocw-noprint">
              <div className="ocw-card">
                <h2><ClipboardList size={17} /> Dados da entrega</h2>
                <div className="ocw-grid g3">
                  <div className="ocw-field">
                    <label>Data da entrega</label>
                    <input type="date" value={order.dataEntrega} onChange={e => setOrder(o => ({ ...o, dataEntrega: e.target.value }))} />
                  </div>
                  <div className="ocw-field">
                    <label>Hora</label>
                    <input type="time" value={order.hora} onChange={e => setOrder(o => ({ ...o, hora: e.target.value }))} />
                  </div>
                  <div className="ocw-field">
                    <label>NF</label>
                    <input value={order.nf} onChange={e => setOrder(o => ({ ...o, nf: e.target.value }))} />
                  </div>
                </div>

                <div className="ocw-grid g2" style={{ marginTop: '0.7rem' }}>
                  <div className="ocw-field">
                    <label>Caminhão</label>
                    <select
                      value={order.truckId}
                      onChange={e => {
                        const truck = trucks.find(t => t.id === e.target.value);
                        setOrder(o => ({ ...o, truckId: e.target.value, motorista: truck?.motorista || '' }));
                      }}
                    >
                      <option value="">Selecionar caminhão…</option>
                      {trucks.map(t => <option key={t.id} value={t.id}>{t.placa} — {t.motorista}</option>)}
                    </select>
                  </div>
                  <div className="ocw-field">
                    <label>Transportadora (nº)</label>
                    <input value={order.transportadora} onChange={e => setOrder(o => ({ ...o, transportadora: e.target.value }))} />
                  </div>
                </div>

                <div className="ocw-field" style={{ marginTop: '0.7rem' }}>
                  <label>Motorista (nesta viagem)</label>
                  <input
                    value={order.motorista}
                    onChange={e => setOrder(o => ({ ...o, motorista: e.target.value }))}
                    placeholder="Sidnei"
                  />
                </div>
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
                      {order.produtores.length > 1 && (
                        <button className="ocw-btn danger" onClick={() => removeProdutor(p.id)}><Trash2 size={16} /></button>
                      )}
                    </div>

                    {p.items.map(it => (
                      <div className="ocw-item-row" key={it.id}>
                        <div className="ocw-field">
                          <label>Produto</label>
                          <ProductPicker products={products} value={it.productId} onChange={id => updateItem(p.id, it.id, { productId: id })} />
                        </div>
                        <div className="ocw-field">
                          <label>Quantidade</label>
                          <input type="number" value={it.quantidade} onChange={e => updateItem(p.id, it.id, { quantidade: e.target.value })} />
                        </div>
                        <div className="ocw-field">
                          <label>Preço unit. (R$)</label>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="0,00"
                            value={it.precoOverride}
                            onChange={e => updateItem(p.id, it.id, { precoOverride: e.target.value })}
                          />
                        </div>
                        <div className="ocw-field">
                          <label>Pagamento</label>
                          <input value={it.pagamento} onChange={e => updateItem(p.id, it.id, { pagamento: e.target.value })} />
                        </div>
                        <div className="ocw-field">
                          <label>Total</label>
                          <div className="ocw-mono" style={{ padding: '0.5rem 0', fontWeight: 600 }}>R$ {brl(it.total)}</div>
                        </div>
                        <button className="ocw-btn danger" onClick={() => removeItem(p.id, it.id)}><X size={16} /></button>
                      </div>
                    ))}

                    <div style={{ marginTop: '0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <button className="ocw-btn ghost" onClick={() => addItem(p.id)}><Plus size={15} /> Adicionar item</button>
                      <span className="ocw-mono" style={{ fontSize: '0.8rem', color: 'var(--ink-soft)' }}>
                        Subtotal: {p.subtotalSacos} sacos · R$ {brl(p.subtotalValor)}
                      </span>
                    </div>
                  </div>
                ))}
                <button className="ocw-btn primary" onClick={addProdutor}><Plus size={15} /> Adicionar produtor</button>
              </div>

              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="ocw-btn primary" onClick={saveOrder} disabled={saveState === 'saving'}>
                  <Save size={15} /> {order.id ? 'Atualizar ordem' : 'Salvar ordem'}
                </button>
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
                  <div className="cell grow"><b>Quantidade:</b> {totalPorTipoLabel}</div>
                </div>

                <div className="section-label">Itens por produtor</div>
                {produtoresComputed.filter(p => p.nome).map(p => (
                  <div className="produtor-block" key={p.id}>
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
                          <div className="cell col-qtd"><b>{it.quantidade || 0}</b></div>
                          <div className="cell col-desc"><b>{productLabel(it.prod)}</b></div>
                          <div className="cell col-preco">R$ {brl(it.preco)}</div>
                          <div className="cell col-total">R$ {brl(it.total)}</div>
                        </div>
                        <div className="row lote-row"><div className="cell grow">Pagamento: {it.pagamento}</div></div>
                      </React.Fragment>
                    ))}
                        <div className="row">
                          <div className="cell grow right">Subtotal {p.nome}:</div>
                          <div className="cell">{p.subtotalPorTipoLabel} — R$ {brl(p.subtotalValor)}</div>
                        </div>
                      </div>
                    ))}
                <div className="row total-row">
                  <div className="cell grow right">Quant. Total:</div>
                  <div className="cell">{totalPorTipoLabel}</div>
                </div>
                <div className="row total-row">
                  <div className="cell grow right">Valor Total Geral:</div>
                  <div className="cell">R$ {brl(totalValor)}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {aviso && (
        <div className={`ocw-aviso ${aviso.tipo}`} role="status">
          <span style={{ flex: 1 }}>{aviso.texto}</span>
          <button onClick={() => setAviso(null)} aria-label="Fechar aviso"><X size={16} /></button>
        </div>
      )}
    </div>
  );
}

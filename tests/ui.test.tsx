import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { JSDOM } from 'jsdom';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mapQuote, mapOrder } from '../src/api/adapters';
import { loadERPState } from '../src/utils/storage';
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, localStorage: dom.window.localStorage });
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).alert = () => {};
const { render, fireEvent, waitFor, cleanup, act } = await import('@testing-library/react');
const { NewOrderModal } = await import('../src/components/NewOrderModal');
const { PublicPortalView } = await import('../src/components/PublicPortalView');
const { PrintOrderTicketModal } = await import('../src/components/PrintOrderTicketModal');
const { initialCompanyProfile } = await import('../src/data/initialData');
afterEach(cleanup);
const order: any = { id: 'OP-TEST', backendId: 'uuid-test', clientName: 'Cliente Teste', itemTitle: 'Peça teste', totalPieces: 3,
  priority: 'normal', targetDeliveryDate: '2026-11-20', technicalNotes: '', assignedTeam: '', stage: 'aguardando_liberacao',
  creationDate: '2026-10-28', sizes: { pp: 0, p: 3, m: 0, g: 0, gg: 0, xg: 0, exg: 0, sobMedida: 0 },
  customizations: [], materials: [], costBreakdown: {}, entryPaymentConfirmed: false, artApproved: false };

test('formulário de OP permanece aberto após falha e bloqueia envio simultâneo', async () => {
  let calls = 0; let closed = false; let finish!: (value: boolean) => void;
  const component = render(<NewOrderModal clients={[]} existingOrder={order} onClose={() => { closed = true; }}
    onSaveOrder={async () => { calls++; return new Promise<boolean>((resolve) => { finish = resolve; }); }} />);
  const form = component.container.querySelector('form')!;
  fireEvent.submit(form); fireEvent.submit(form);
  assert.equal(calls, 1); assert.equal(closed, false);
  finish(false);
  await waitFor(() => assert.equal(component.getByRole('button', { name: 'Salvar alterações' }).hasAttribute('disabled'), false));
  assert.equal(closed, false); assert.ok(component.getByRole('dialog'));
});
test('formulário de OP só fecha após confirmação do servidor', async () => {
  let closed = false;
  const component = render(<NewOrderModal clients={[]} existingOrder={order} onClose={() => { closed = true; }} onSaveOrder={async () => true} />);
  fireEvent.submit(component.container.querySelector('form')!);
  await waitFor(() => assert.equal(closed, true));
});
test('solicitação pública não mostra sucesso quando a API falha', async () => {
  let calls = 0;
  const component = render(<PublicPortalView catalog={[]} profile={initialCompanyProfile} onRequestQuote={async () => { calls++; return false; }} />);
  const button = component.getAllByRole('button').find((element) => /solicitar/i.test(element.textContent || ''));
  assert.ok(button); fireEvent.click(button);
  const form = component.container.querySelector('form'); assert.ok(form);
  fireEvent.submit(form);
  await waitFor(() => assert.equal(calls, 1));
  assert.equal(component.queryByText(/solicitação enviada com sucesso/i), null);
  assert.ok(component.container.querySelector('form'));
});
test('ficha impressa reflete gates pendentes, sem selo fixo de aprovação', () => {
  const html = renderToStaticMarkup(<PrintOrderTicketModal order={order} profile={initialCompanyProfile} onClose={() => {}} />);
  assert.match(html, /Sinal pendente/); assert.match(html, /Arte pendente/);
  assert.doesNotMatch(html, /Sinal Confirmado · Arte Aprovada/);
});
test('adaptadores preservam zero e o custo do item correto em propostas com vários itens', () => {
  const items = [{ id: 'one', materialUnitCost: 0, outsourcedSewingUnitCost: 0, customizationUnitCost: 0,
    freightUnitCost: 0, technicalLossPercentage: 0, markupPercentage: 0, calculatedBaseUnitCost: 0, suggestedUnitPrice: 0,
    negotiatedUnitPrice: 0, totalItemPrice: 0, customizations: [] },
  { id: 'two', materialUnitCost: 20, negotiatedUnitPrice: 50, calculatedBaseUnitCost: 25 }];
  const quote: any = { id: 'q', quoteNumber: 'ORC-1', clientId: 'c', items };
  const mapped = mapQuote(quote, []);
  assert.equal(mapped.backendId, 'q'); assert.equal(mapped.items[0].costBreakdown.markupPercentage, 0);
  assert.equal(mapped.items[0].unitFinalPrice, 0);
  const mappedOrder = mapOrder({ ...order, revision: 7, quoteId: 'q', quoteItemId: 'two' }, [], [quote]);
  assert.equal(mappedOrder.costBreakdown.negotiatedUnitPrice, 50);
  assert.equal(mappedOrder.canStartProduction, false);
  assert.equal(mappedOrder.revision, 7);
});
test('estado inicial remove dados privados legados de localStorage', () => {
  localStorage.setItem('defardas_clients_v2', JSON.stringify([{ name: 'private-test' }]));
  const state = loadERPState();
  assert.deepEqual(state.clients, []); assert.deepEqual(state.finance, []);
  assert.equal(localStorage.getItem('defardas_clients_v2'), null);
});

const { WhatsAppOmnichannelView } = await import('../src/components/WhatsAppOmnichannelView');
const { api } = await import('../src/api/client');
const conversationFixture = { id: 'conversation-test', channelId: 'channel-test', customerName: 'Contato Teste',
  customerPhone: '000', status: 'open', unreadCount: 0 };
async function withCommunication(run: () => Promise<void>) {
  const originals = { getChannels: api.getChannels, getConversations: api.getConversations,
    getConversationMessages: api.getConversationMessages, sendConversationMessage: api.sendConversationMessage,
    getChannelQr: api.getChannelQr, reconnectChannel: api.reconnectChannel };
  api.getChannels = async () => ({ status: 200, data: [{ id: 'channel-test', provider: 'wa_akg', phoneNumber: '000', status: 'disconnected' }] });
  api.getConversations = async () => ({ status: 200, data: [conversationFixture] });
  api.getConversationMessages = async () => ({ status: 200, data: [] });
  try { await run(); } finally { cleanup(); Object.assign(api, originals); }
}

test('WhatsApp preserva texto na falha e bloqueia envio simultâneo', async () => {
  await withCommunication(async () => {
    let calls = 0; let finish!: (value: any) => void;
    api.sendConversationMessage = async () => { calls++; return new Promise((resolve) => { finish = resolve; }); };
    const component = render(<WhatsAppOmnichannelView />);
    const input = await component.findByPlaceholderText('Escreva uma mensagem no WhatsApp do cliente...');
    fireEvent.change(input, { target: { value: 'Mensagem preservada' } });
    const form = input.closest('form')!;
    fireEvent.submit(form); fireEvent.submit(form);
    assert.equal(calls, 1);
    finish({ status: 503, error: 'Provedor indisponível' });
    await waitFor(() => assert.equal(component.getByRole('alert').textContent, 'Provedor indisponível'));
    assert.equal((input as HTMLInputElement).value, 'Mensagem preservada');
    assert.ok(component.getByRole('button', { name: 'Enviar' }));
  });
});

test('WhatsApp mostra falha persistida sem recibo de entrega e limpa texto apenas no sucesso', async () => {
  await withCommunication(async () => {
    api.sendConversationMessage = async () => ({ status: 201, data: { id: 'failed-message', direction: 'outbound',
      body: 'Texto', status: 'failed', createdAt: new Date().toISOString() } });
    const component = render(<WhatsAppOmnichannelView />);
    const input = await component.findByPlaceholderText('Escreva uma mensagem no WhatsApp do cliente...');
    fireEvent.change(input, { target: { value: 'Texto' } });
    fireEvent.submit(input.closest('form')!);
    await component.findByText('Falha no envio');
    assert.equal((input as HTMLInputElement).value, 'Texto');
    assert.equal(component.queryByLabelText('Status: delivered'), null);
    api.sendConversationMessage = async () => ({ status: 201, data: { id: 'sent-message', direction: 'outbound',
      body: 'Texto', status: 'sent', createdAt: new Date().toISOString() } });
    await waitFor(() => assert.equal(component.getByRole('button', { name: 'Enviar' }).hasAttribute('disabled'), false));
    fireEvent.submit(input.closest('form')!);
    await component.findByText('Enviada ao provedor');
    await waitFor(() => assert.equal((input as HTMLInputElement).value, ''));
  });
});

test('WhatsApp consulta QR real e informa falhas de QR e reconexão sem imagem externa', async () => {
  await withCommunication(async () => {
    let qrCalls = 0;
    api.getChannelQr = async () => { qrCalls++; return { status: 503, error: 'QR indisponível' }; };
    api.reconnectChannel = async () => ({ status: 501, error: 'Reconexão indisponível' });
    const component = render(<WhatsAppOmnichannelView />);
    await component.findByPlaceholderText('Escreva uma mensagem no WhatsApp do cliente...');
    const qrButton = component.container.querySelector('button svg.lucide-qr-code')?.closest('button');
    assert.ok(qrButton); fireEvent.click(qrButton);
    await component.findByText('QR indisponível');
    assert.equal(qrCalls, 1);
    assert.equal(component.queryByAltText('QR Code WhatsApp'), null);
    assert.equal(component.container.innerHTML.includes('qrserver.com'), false);
    fireEvent.click(component.getByRole('button', { name: 'Reconectar Canal' }));
    await component.findByText('Reconexão indisponível');
    assert.equal(component.queryByAltText('QR Code WhatsApp'), null);
  });
});

test('atalhos WhatsApp preparam rascunho para revisão sem envio nem chave PIX presumida', async () => {
  await withCommunication(async () => {
    let calls = 0;
    api.sendConversationMessage = async () => { calls++; throw new Error('Unexpected send'); };
    const component = render(<WhatsAppOmnichannelView />);
    const input = await component.findByPlaceholderText('Escreva uma mensagem no WhatsApp do cliente...') as HTMLInputElement;
    fireEvent.click(component.getByRole('button', { name: 'Preparar pedido de aprovação' }));
    assert.match(input.value, /validação da arte e do sinal/);
    fireEvent.click(component.getByRole('button', { name: 'Preparar lembrete de sinal' }));
    assert.match(input.value, /dados de pagamento/);
    assert.doesNotMatch(input.value, /CNPJ|PIX|50%/);
    assert.equal(calls, 0);
  });
});

test('troca de conversa preserva rascunhos separados e ignora histórico atrasado', async () => {
  await withCommunication(async () => {
    api.getConversations = async () => ({ status: 200, data: [conversationFixture,
      { ...conversationFixture, id: 'conversation-second', customerName: 'Segundo Contato' }] });
    let finishFirst!: (value: any) => void;
    api.getConversationMessages = async (id) => id === 'conversation-test'
      ? new Promise((resolve) => { finishFirst = resolve; })
      : { status: 200, data: [{ id: 'second-msg', direction: 'inbound', status: 'delivered', body: 'Histórico segundo', createdAt: new Date().toISOString() }] };
    const component = render(<WhatsAppOmnichannelView />);
    const input = await component.findByPlaceholderText('Escreva uma mensagem no WhatsApp do cliente...') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Rascunho primeiro' } });
    fireEvent.click(component.getByText('Segundo Contato'));
    await component.findByText('Histórico segundo');
    assert.equal(input.value, '');
    fireEvent.change(input, { target: { value: 'Rascunho segundo' } });
    await act(async () => {
      finishFirst({ status: 200, data: [{ id: 'first-msg', body: 'Histórico atrasado', createdAt: new Date().toISOString() }] });
    });
    assert.equal(component.queryByText('Histórico atrasado'), null);
    fireEvent.click(component.getByText('Contato Teste'));
    assert.equal(input.value, 'Rascunho primeiro');
    fireEvent.click(component.getByText('Segundo Contato'));
    assert.equal(input.value, 'Rascunho segundo');
    await component.findByText('Histórico segundo');
  });
});

test('envio pendente preserva rascunho e reutiliza chave sem nova intenção de envio', async () => {
  await withCommunication(async () => {
    const keys: string[] = [];
    api.sendConversationMessage = async (_id, _body, _media, key) => {
      keys.push(key!);
      return { status: 201, data: { id: 'pending-message', body: 'Pendente', status: 'pending', direction: 'outbound', createdAt: new Date().toISOString() } };
    };
    const component = render(<WhatsAppOmnichannelView />);
    const input = await component.findByPlaceholderText('Escreva uma mensagem no WhatsApp do cliente...') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Pendente' } });
    fireEvent.submit(input.closest('form')!);
    await component.findByRole('alert');
    await waitFor(() => assert.equal(component.getByRole('button', { name: 'Enviar' }).hasAttribute('disabled'), false));
    assert.equal(input.value, 'Pendente');
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => assert.equal(keys.length, 2));
    assert.equal(keys[0], keys[1]);
    await waitFor(() => assert.equal(component.getByRole('button', { name: 'Enviar' }).hasAttribute('disabled'), false));
    assert.equal(component.getAllByLabelText('Status: pending').length, 1);
  });
});

const { FinancialView } = await import('../src/components/FinancialView');
test('formulário financeiro conserva chave em falha e bloqueia duplo envio', async () => {
  const keys: string[] = []; let finish!: (value: boolean) => void;
  const component = render(<FinancialView transactions={[]} onDeleteTransaction={() => {}} onToggleStatus={() => {}}
    onSaveTransaction={async (_title, key) => { keys.push(key!); return new Promise((resolve) => { finish = resolve; }); }} />);
  fireEvent.click(component.getByRole('button', { name: /Novo Lançamento/ }));
  const form = component.container.querySelector('form')!; assert.ok(form);
  fireEvent.submit(form); fireEvent.submit(form); assert.equal(keys.length, 1);
  await act(async () => { finish(false); });
  await waitFor(() => assert.equal(component.container.querySelector('button[type="submit"]')?.hasAttribute('disabled'), false));
  fireEvent.submit(form); assert.equal(keys.length, 2); assert.equal(keys[0], keys[1]);
  await act(async () => { finish(true); });
  await waitFor(() => assert.equal(component.container.querySelector('form') === null, true));
});


test('cliente envia revisão da leitura para etapa e preserva código de conflito sem repetir chamada', async () => {
  const { api } = await import('../src/api/client');
  const originalFetch = globalThis.fetch; const oldCsrf = api.getCsrfToken(); const requests: any[] = [];
  api.setCsrfToken('test-revision-csrf');
  globalThis.fetch = async (_url, options) => {
    requests.push(options);
    return new Response(JSON.stringify({ error: 'Updated order', code: 'ORDER_REVISION_CONFLICT' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const response = await api.advanceOrderStage('uuid-test', 'corte', 7);
    assert.equal(response.status, 409); assert.equal(response.code, 'ORDER_REVISION_CONFLICT');
    assert.equal(requests.length, 1); assert.deepEqual(JSON.parse(requests[0].body), { targetStage: 'corte', expectedRevision: 7 });
  } finally { globalThis.fetch = originalFetch; api.setCsrfToken(oldCsrf); }
});

test('edição de estoque preserva saldo observado ao abrir formulário mesmo após recarga da lista', async () => {
  const { InventoryView } = await import('../src/components/InventoryView');
  const item: any = { id: 'stock-test', code: 'TEC-TEST', name: 'Tecido', category: 'tecido', unit: 'metros', currentStock: 10,
    allocatedStock: 0, inPartnersCustodyStock: 0, minStock: 0, costPrice: 1, supplier: '', location: '', lastRestocked: '2026-10-30' };
  const saved: any[] = []; const props = { onSaveItem: async (value: any) => { saved.push(value); return false; }, onDeleteItem: () => {} };
  const view = render(<InventoryView inventory={[item]} {...props} />);
  fireEvent.click(view.getByTitle('Editar item'));
  view.rerender(<InventoryView inventory={[{ ...item, currentStock: 12 }]} {...props} />);
  fireEvent.submit(view.container.querySelector('form')!);
  await waitFor(() => assert.equal(saved.length, 1));
  assert.equal(saved[0].currentStock, 10); assert.equal(saved[0].expectedPhysicalStock, 10);
  assert.ok(view.container.querySelector('form'));
});

test('atalho de estoque envia saldo observado antes do ajuste', async () => {
  const { InventoryView } = await import('../src/components/InventoryView'); const saved: any[] = [];
  const item: any = { id: 'stock-quick', code: 'TEC-QUICK', name: 'Tecido', category: 'tecido', unit: 'metros', currentStock: 10,
    allocatedStock: 0, inPartnersCustodyStock: 0, minStock: 0, costPrice: 1, supplier: '', location: '', lastRestocked: '2026-10-30' };
  const view = render(<InventoryView inventory={[item]} onSaveItem={async value => { saved.push(value); return true; }} onDeleteItem={() => {}} />);
  fireEvent.click(view.getByTitle('Adicionar 50 unidades (Entrada de Rolo)'));
  await waitFor(() => assert.equal(saved.length, 1));
  assert.equal(saved[0].currentStock, 60); assert.equal(saved[0].expectedPhysicalStock, 10);
});

test('cadastro de material inicia sem dados fictícios e usa código gerado pelo servidor', async () => {
  const { InventoryView } = await import('../src/components/InventoryView'); const saved: any[] = [];
  const view = render(<InventoryView inventory={[]} onSaveItem={async value => { saved.push(value); return false; }} onDeleteItem={() => {}} />);
  fireEvent.click(view.getByRole('button', { name: /Cadastrar Tecido/ }));
  const code = view.getByLabelText('Código do Insumo') as HTMLInputElement;
  assert.equal(code.value, ''); assert.equal(code.readOnly, true); assert.equal(code.required, false);
  for (const label of ['Saldo Atual', 'Estoque Mínimo', 'Custo Unitário (R$)']) {
    const field = view.getByLabelText(label) as HTMLInputElement;
    assert.equal(field.value, '0'); assert.equal(field.step, '0.01');
    field.value = '1.25'; assert.equal(field.checkValidity(), true);
    field.value = '-1'; assert.equal(field.checkValidity(), false);
    field.value = '1.001'; assert.equal(field.checkValidity(), false);
    field.value = '100000000'; assert.equal(field.checkValidity(), false);
  }
  assert.equal((view.getByLabelText('Fornecedor Principal') as HTMLInputElement).value, '');
  assert.equal((view.getByLabelText('Localização no Galpão') as HTMLInputElement).value, '');
  fireEvent.submit(view.container.querySelector('form')!);
  await waitFor(() => assert.equal(saved.length, 1));
  assert.equal(saved[0].currentStock, 0); assert.equal(saved[0].costPrice, 0);
  assert.equal(saved[0].supplier, ''); assert.equal(saved[0].location, ''); assert.equal(saved[0].code, '');
});

test('cadastro de cliente não presume cidade, UF ou segmento e mantém contrato de campos', async () => {
  const { ClientsView } = await import('../src/components/ClientsView'); const saved: any[] = [];
  const view = render(<ClientsView clients={[]} onSaveClient={async value => { saved.push(value); return false; }} onDeleteClient={() => {}} />);
  fireEvent.click(view.getByRole('button', { name: /Cadastrar Novo Cliente/ }));
  for (const label of ['Cidade', 'UF', 'Segmento']) assert.equal((view.getByLabelText(label) as HTMLInputElement).value, '');
  for (const [label, limit] of [['Cidade',80], ['UF',2], ['Segmento',60], ['Nome Fantasia',150], ['CNPJ *',20]] as const) {
    assert.equal((view.getByLabelText(label) as HTMLInputElement).maxLength, limit);
  }
  assert.equal((view.getByLabelText('Nome do Contato / Cargo') as HTMLInputElement).required, true);
  assert.equal((view.getByLabelText('Telefone / WhatsApp') as HTMLInputElement).required, true);
  fireEvent.submit(view.container.querySelector('form')!);
  await waitFor(() => assert.equal(saved.length, 1));
  assert.equal(saved[0].city, ''); assert.equal(saved[0].state, ''); assert.equal(saved[0].segment, '');
});

test('perfil institucional bloqueia envio simultâneo e remove sucesso antigo na próxima tentativa', async () => {
  const { SettingsView } = await import('../src/components/SettingsView'); let calls = 0; let finish!: (result: boolean) => void;
  const view = render(<SettingsView profile={initialCompanyProfile} fullState={{} as any} onSaveProfile={async () => { calls++; return new Promise<boolean>(resolve => { finish = resolve; }); }} onRestoreState={async () => false} onResetToDefaults={() => {}} />);
  const form = view.container.querySelector('form')!;
  const button = () => view.getByRole('button', { name: 'Salvar Informações Cadastrais' });
  const success = 'Dados cadastrais da empresa atualizados com sucesso!';
  fireEvent.submit(form); fireEvent.submit(form); assert.equal(calls, 1); assert.equal(button().hasAttribute('disabled'), true);
  await act(async () => finish(true));
  await waitFor(() => assert.equal(Boolean(view.queryByText(success)), true));
  fireEvent.submit(form); assert.equal(calls, 2); assert.equal(Boolean(view.queryByText(success)), false);
  await act(async () => finish(false));
  await waitFor(() => assert.equal(button().hasAttribute('disabled'), false));
  assert.equal(Boolean(view.queryByText(success)), false);
});

test('exceção no salvamento do perfil libera formulário sem anunciar sucesso', async () => {
  const { SettingsView } = await import('../src/components/SettingsView');
  const view = render(<SettingsView profile={initialCompanyProfile} fullState={{} as any} onSaveProfile={async () => { throw new Error('Falha de rede'); }} onRestoreState={async () => false} onResetToDefaults={() => {}} />);
  fireEvent.submit(view.container.querySelector('form')!);
  await waitFor(() => assert.equal(view.getByRole('button', { name: 'Salvar Informações Cadastrais' }).hasAttribute('disabled'), false));
  assert.equal(Boolean(view.queryByText('Dados cadastrais da empresa atualizados com sucesso!')), false);
});

test('alternar textos sem confirmação preserva cada chave e sucesso encerra somente a tentativa correspondente', async () => {
  await withCommunication(async () => {
    const calls: { body: string; key: string }[] = [];
    api.sendConversationMessage = async (_id, body, _media, key) => {
      calls.push({ body, key: key! });
      return calls.length === 3 ? { status: 201, data: { id: 'confirmed-a', body, direction: 'outbound', status: 'sent', createdAt: new Date().toISOString() } }
        : { status: 503, error: 'Envio sem confirmação' };
    };
    const view = render(<WhatsAppOmnichannelView />);
    const input = await view.findByPlaceholderText('Escreva uma mensagem no WhatsApp do cliente...') as HTMLInputElement;
    for (const [index, body] of ['A', 'B', ' A ', 'B', 'A'].entries()) {
      fireEvent.change(input, { target: { value: body } }); fireEvent.submit(input.closest('form')!);
      await waitFor(() => assert.equal(calls.length, index + 1));
      if (index === 2) await waitFor(() => assert.equal(input.value, ''));
      else await waitFor(() => assert.equal(view.getByRole('button', { name: 'Enviar' }).hasAttribute('disabled'), false));
    }
    assert.equal(calls[0].key, calls[2].key);
    assert.equal(calls[1].key, calls[3].key);
    assert.notEqual(calls[0].key, calls[1].key);
    assert.notEqual(calls[0].key, calls[4].key);
    assert.equal(calls[2].body, 'A');
  });
});

test('histórico atrasado da mesma conversa preserva envio confirmado e não duplica ID', async () => {
  for (const includesSent of [false, true]) await withCommunication(async () => {
    let finishHistory!: (value: any) => void;
    const sent = { id: 'sent-during-history', body: 'Mensagem confirmada', direction: 'outbound', status: 'sent', createdAt: new Date().toISOString() };
    api.getConversationMessages = async () => new Promise(resolve => { finishHistory = resolve; });
    api.sendConversationMessage = async () => ({ status: 201, data: sent });
    const view = render(<WhatsAppOmnichannelView />);
    const input = await view.findByPlaceholderText('Escreva uma mensagem no WhatsApp do cliente...') as HTMLInputElement;
    fireEvent.change(input, { target: { value: sent.body } }); fireEvent.submit(input.closest('form')!);
    await waitFor(() => assert.equal(input.value, ''));
    await act(async () => finishHistory({ status: 200, data: [
      { id: 'older', body: 'Histórico anterior', direction: 'inbound', status: 'read', createdAt: sent.createdAt },
      ...(includesSent ? [sent] : []),
    ] }));
    await view.findByText('Histórico anterior');
    assert.equal(view.getAllByLabelText('Status: sent').length, 1);
    assert.ok(view.getAllByText(sent.body).length > 0);
  });
});

test('falha inesperada ao carregar histórico encerra espera e informa erro seguro', async () => {
  await withCommunication(async () => {
    api.getConversationMessages = async () => { throw new Error('private-provider-detail'); };
    const view = render(<WhatsAppOmnichannelView />);
    await view.findByRole('alert');
    assert.equal(view.getByRole('alert').textContent, 'Não foi possível carregar o histórico.');
    assert.equal(view.container.textContent?.includes('private-provider-detail'), false);
  });
});

test('lista de conversas aceita somente a consulta mais nova diante de respostas invertidas', async () => {
  await withCommunication(async () => {
    let calls = 0; let finishOld!: (value: any) => void;
    api.getConversations = async () => ++calls === 1 ? new Promise(resolve => { finishOld = resolve; })
      : { status: 200, data: [{ ...conversationFixture, id: 'newest', customerName: 'Contato atualizado' }] };
    const view = render(<WhatsAppOmnichannelView />);
    await waitFor(() => assert.equal(calls, 1));
    fireEvent.click(view.getByTitle('Atualizar conversas'));
    await view.findAllByText('Contato atualizado');
    await act(async () => finishOld({ status: 200, data: [{ ...conversationFixture, customerName: 'Contato obsoleto' }] }));
    assert.equal(Boolean(view.queryByText('Contato obsoleto')), false);
    assert.ok(view.getAllByText('Contato atualizado').length > 0);
  });
});

test('consulta de lista invalidada na desmontagem não inicia carregamento de conversa', async () => {
  await withCommunication(async () => {
    let finish!: (value: any) => void; let historyCalls = 0;
    api.getConversations = async () => new Promise(resolve => { finish = resolve; });
    api.getConversationMessages = async () => { historyCalls++; return { status: 200, data: [] }; };
    const view = render(<WhatsAppOmnichannelView />);
    view.unmount();
    await act(async () => finish({ status: 200, data: [conversationFixture] }));
    assert.equal(historyCalls, 0);
  });
});

test('confirmação após trocar conversa limpa somente rascunho de origem e encerra sua chave', async () => {
  await withCommunication(async () => {
    api.getConversations = async () => ({ status: 200, data: [conversationFixture, { ...conversationFixture, id: 'second', customerName: 'Segundo Contato' }] });
    const keys: string[] = []; let finish!: (value: any) => void;
    api.sendConversationMessage = async (_id, _body, _media, key) => { keys.push(key!); return new Promise(resolve => { finish = resolve; }); };
    const view = render(<WhatsAppOmnichannelView />);
    const input = await view.findByPlaceholderText('Escreva uma mensagem no WhatsApp do cliente...') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Enviado na origem' } }); fireEvent.submit(input.closest('form')!);
    fireEvent.click(view.getByText('Segundo Contato'));
    fireEvent.change(input, { target: { value: 'Rascunho segundo' } });
    await act(async () => finish({ status: 201, data: { id: 'confirmed-first', body: 'Enviado na origem', direction: 'outbound', status: 'sent', createdAt: new Date().toISOString() } }));
    assert.equal(input.value, 'Rascunho segundo'); assert.equal(view.queryAllByLabelText('Status: sent').length, 0);
    fireEvent.click(view.getByText('Contato Teste'));
    assert.equal(input.value, '');
    fireEvent.change(input, { target: { value: 'Enviado na origem' } }); fireEvent.submit(input.closest('form')!);
    assert.equal(keys.length, 2); assert.notEqual(keys[0], keys[1]);
    await act(async () => finish({ status: 503, error: 'Não confirmado' }));
  });
});

test('falha após trocar conversa não contamina erro atual e preserva rascunho e chave de origem', async () => {
  await withCommunication(async () => {
    api.getConversations = async () => ({ status: 200, data: [conversationFixture, { ...conversationFixture, id: 'second', customerName: 'Segundo Contato' }] });
    const keys: string[] = []; let finish!: (value: any) => void;
    api.sendConversationMessage = async (_id, _body, _media, key) => { keys.push(key!); return new Promise(resolve => { finish = resolve; }); };
    const view = render(<WhatsAppOmnichannelView />);
    const input = await view.findByPlaceholderText('Escreva uma mensagem no WhatsApp do cliente...') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Tentativa incerta' } }); fireEvent.submit(input.closest('form')!);
    fireEvent.click(view.getByText('Segundo Contato'));
    await act(async () => finish({ status: 503, error: 'Falha na origem' }));
    assert.equal(Boolean(view.queryByRole('alert')), false);
    fireEvent.click(view.getByText('Contato Teste')); assert.equal(input.value, 'Tentativa incerta');
    fireEvent.submit(input.closest('form')!); assert.equal(keys.length, 2); assert.equal(keys[0], keys[1]);
    await act(async () => finish({ status: 503, error: 'Não confirmado' }));
  });
});

test('QR trata exceções sem expor detalhes e reconexão falha remove imagem anterior', async () => {
  await withCommunication(async () => {
    api.getChannelQr = async () => { throw new Error('private-qr-detail'); };
    const view = render(<WhatsAppOmnichannelView />);
    await view.findByPlaceholderText('Escreva uma mensagem no WhatsApp do cliente...');
    const open = view.container.querySelector('button svg.lucide-qr-code')!.closest('button')!;
    fireEvent.click(open);
    await view.findByText('Não foi possível consultar o QR Code.');
    assert.equal(view.getByRole('button', { name: 'Reconectar Canal' }).hasAttribute('disabled'), false);
    fireEvent.click(view.getByRole('button', { name: 'Fechar' }));
    api.getChannelQr = async () => ({ status: 200, data: { qrCode: 'data:image/png;base64,fixture' } });
    fireEvent.click(open); await view.findByAltText('QR Code WhatsApp');
    api.reconnectChannel = async () => { throw new Error('private-reconnect-detail'); };
    fireEvent.click(view.getByRole('button', { name: 'Reconectar Canal' }));
    await view.findByText('Não foi possível reconectar o canal.');
    assert.equal(Boolean(view.queryByAltText('QR Code WhatsApp')), false);
    assert.equal(view.container.textContent?.includes('private-'), false);
    assert.equal(view.getByRole('button', { name: 'Reconectar Canal' }).hasAttribute('disabled'), false);
  });
});

test('QR recebido depois de fechar modal não reaparece', async () => {
  await withCommunication(async () => {
    let finish!: (value: any) => void;
    api.getChannelQr = async () => new Promise(resolve => { finish = resolve; });
    const view = render(<WhatsAppOmnichannelView />);
    await view.findByPlaceholderText('Escreva uma mensagem no WhatsApp do cliente...');
    fireEvent.click(view.container.querySelector('button svg.lucide-qr-code')!.closest('button')!);
    fireEvent.click(view.getByRole('button', { name: 'Fechar' }));
    await act(async () => finish({ status: 200, data: { qrCode: 'data:image/png;base64,fixture' } }));
    assert.equal(Boolean(view.queryByAltText('QR Code WhatsApp')), false);
    assert.equal(Boolean(view.queryByRole('button', { name: 'Reconectar Canal' })), false);
  });
});

test('proposta aceita centavos e percentuais decimais sem truncar grade ou prazo inválido', async () => {
  const { AuthProvider } = await import('../src/api/authContext');
  const { NewQuoteModal } = await import('../src/components/NewQuoteModal');
  const oldMe = api.getMe; const oldHealth = api.getHealth;
  api.getMe = async () => ({ status: 401 }); api.getHealth = async () => ({ status: 200, data: { status: 'healthy' } });
  try {
    const view = render(<AuthProvider><NewQuoteModal clients={[]} onClose={() => {}} onSaveQuote={async () => false} /></AuthProvider>);
    for (const label of ['Custo de material', 'Custo de costura', 'Custo de personalização', 'Perda técnica percentual', 'Markup percentual', 'Preço negociado']) {
      const field = view.getByLabelText(label) as HTMLInputElement;
      assert.equal(field.step, '0.01'); field.value = '1.25'; assert.equal(field.checkValidity(), true);
      field.value = '1.005'; assert.equal(field.checkValidity(), false);
    }
    for (const label of ['Quantidade p', 'Prazo de fabricação']) {
      const field = view.getByLabelText(label) as HTMLInputElement;
      fireEvent.change(field, { target: { value: '1.5' } });
      assert.equal(field.value, '1.5'); assert.equal(field.checkValidity(), false);
      fireEvent.change(field, { target: { value: '-1' } });
      assert.equal(field.value, '-1'); assert.equal(field.checkValidity(), false);
    }
    await act(async () => {});
  } finally { api.getMe = oldMe; api.getHealth = oldHealth; }
});

test('prévia enviada pela proposta usa margem e parcelas iguais ao motor do servidor', async () => {
  const { AuthProvider } = await import('../src/api/authContext');
  const { NewQuoteModal } = await import('../src/components/NewQuoteModal');
  const { PricingEngine } = await import('../server/services/pricingEngine');
  const oldMe = api.getMe; const oldHealth = api.getHealth;
  api.getMe = async () => ({ status: 401 }); api.getHealth = async () => ({ status: 200 });
  try {
    for (const [cost, price, entry, balance, margin] of [[1, 1.5, 0.75, 0.75, 33.33], [0.01, 0.03, 0.02, 0.01, 66.67]]) {
      const saved: any[] = [];
      const view = render(<AuthProvider><NewQuoteModal clients={[{ id: 'client-test', companyName: 'Test', tradeName: 'Test', phone: '000', segment: '', cnpj: 'TEST' } as any]} onClose={() => {}} onSaveQuote={async value => { saved.push(value); return false; }} /></AuthProvider>);
      fireEvent.change(view.getByLabelText('Custo de material'), { target: { value: String(cost) } });
      fireEvent.change(view.getByLabelText('Preço negociado'), { target: { value: String(price) } });
      fireEvent.change(view.getByLabelText('Quantidade p'), { target: { value: '1' } });
      fireEvent.change(view.getByLabelText('Prazo de fabricação'), { target: { value: '1' } });
      fireEvent.change(view.getByLabelText('Validade da proposta (dias)'), { target: { value: '1' } });
      fireEvent.submit(view.container.querySelector('form')!);
      await waitFor(() => assert.equal(saved.length, 1));
      const expected = PricingEngine.calculateItemPricing({ materialUnitCost: cost, outsourcedSewingUnitCost: 0, customizationUnitCost: 0, freightUnitCost: 0, technicalLossPercentage: 0, markupPercentage: 0, negotiatedUnitPrice: price });
      assert.equal(saved[0].items[0].costBreakdown.estimatedMarginPercentage, expected.estimatedMarginPercentage);
      assert.equal(saved[0].items[0].costBreakdown.estimatedMarginPercentage, margin);
      assert.equal(saved[0].totalAmount, price); assert.equal(saved[0].entryAmount, entry); assert.equal(saved[0].balanceDueAtDelivery, balance);
      view.unmount();
    }
  } finally { api.getMe = oldMe; api.getHealth = oldHealth; }
});

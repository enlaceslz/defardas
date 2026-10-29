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
  const mappedOrder = mapOrder({ ...order, quoteId: 'q', quoteItemId: 'two' }, [], [quote]);
  assert.equal(mappedOrder.costBreakdown.negotiatedUnitPrice, 50);
  assert.equal(mappedOrder.canStartProduction, false);
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

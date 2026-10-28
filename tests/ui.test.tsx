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
const { render, fireEvent, waitFor, cleanup } = await import('@testing-library/react');
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

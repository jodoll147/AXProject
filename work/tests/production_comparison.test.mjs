import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../screen_template.html', import.meta.url), 'utf8');
const calculation = source.slice(source.indexOf('function productionComparison('), source.indexOf('function productionDetail('));
const ymd = ms => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
const compare = vm.runInNewContext(`(${calculation.trim()})`, { ymd });
const at = s => Date.parse(s + '+09:00');
const work = { unit: 'm' };
const plan = { plan_date: '2026-09-16', planned_qty: 100, unit: 'm' };
const actual = (id, end, qty, unit = 'm') => ({ actual_id: id, period_end_at: at(end), accepted_qty_delta: qty, unit });

test('cutoff is inclusive; future records and other units cannot inflate totals', () => {
  const result = compare(work, plan, [
    actual('future', '2026-09-16T13:00', 500),
    actual('b', '2026-09-16T12:00', 20.5),
    actual('wrong-unit', '2026-09-16T11:00', 1000, 'piece'),
    actual('a', '2026-09-16T10:00', 42),
  ], at('2026-09-16T12:00'));
  assert.equal(result.observed.length, 3);
  assert.equal(result.excluded, 1);
  assert.equal(result.observed.at(-1).cumulative, 62.5);
  assert.equal(result.days[0].actual, 62.5);
  assert.equal(result.days[0].difference, -37.5);
  assert.equal(result.days[0].rate, 0.625);
});

test('future plans, zero plans and incompatible plans have no misleading rate', () => {
  const now = at('2026-09-15T12:00');
  const future = compare(work, plan, [], now).days[0];
  assert.equal(future.future, true);
  assert.equal(future.difference, null);
  assert.equal(future.rate, null);
  assert.equal(compare(work, { ...plan, planned_qty: 0 }, [], at('2026-09-16T12:00')).days[0].rate, null);
  assert.equal(compare(work, { ...plan, unit: 'piece' }, [], at('2026-09-16T12:00')).days[0].difference, null);
});

test('KST completion date controls daily attribution; unplanned days keep observed quantity', () => {
  const result = compare(work, plan, [actual('a', '2026-09-17T00:00', 110)], at('2026-09-17T12:00'));
  assert.equal(result.days[0].actual, 0);
  assert.equal(result.days[1].date, '2026-09-17');
  assert.equal(result.days[1].actual, 110);
  assert.equal(result.days[1].difference, null);
  assert.equal(compare(work, null, [], at('2026-09-17T12:00')).days.length, 0);
});

test('achievement above 100 percent is preserved', () => {
  assert.equal(compare(work, plan, [actual('a', '2026-09-16T12:00', 125)], at('2026-09-16T12:00')).days[0].rate, 1.25);
});

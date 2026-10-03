import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { load } from './pi-host.mjs';
const require = createRequire(import.meta.url);
const { visibleWidth } = await import('@earendil-works/pi-tui');

test('timing restores the latest branch checkpoint without replacing native footer', async t => {
  const host = await load(resolve('index.ts'));
  const start = Date.now() - 100000;
  host.entries.push({ type: 'custom', customType: 'pi-time-tracker', data: { sessionStartTime: start, totalWorkingTime: 1000 } });
  host.entries.push({ type: 'custom', customType: 'pi-time-tracker', data: { sessionStartTime: start, totalWorkingTime: 20000, totalStreamingTime: 10000 } });
  await host.emit('session_start');
  const component = host.widgets.get('pi-time-tracker')({ requestRender() {} }, host.ctx.ui.theme);
  t.after(async () => { component.dispose(); await host.emit('session_shutdown'); });
  assert.match(component.render(200)[0], /⚙ 00:00:20/);
  for (const width of [1, 5, 20, 80]) assert.ok(component.render(width).every(line => visibleWidth(line) <= width));
  await host.emit('turn_start');
  await host.emit('turn_end');
  assert.ok(host.entries.at(-1).data.totalWorkingTime >= 20000);
  host.entries.length = 0;
  await host.emit('session_tree');
  assert.equal(host.entries.at(-1).data.totalWorkingTime, 0);
});

test('print mode starts no terminal widget', async () => {
  const host = await load(resolve('index.ts'));
  host.ctx.mode = 'print';
  host.ctx.hasUI = false;
  await host.emit('session_start');
  assert.equal(host.widgets.size, 0);
  await host.emit('session_shutdown');
});

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const { loadExtensions } = await import(new URL('./core/extensions/loader.js', import.meta.resolve('@earendil-works/pi-coding-agent')));

export async function load(entry, cwd = process.cwd()) {
  const result = await loadExtensions([entry], cwd);
  assert.deepEqual(result.errors, [], 'real Pi loader must accept the extension');
  assert.equal(result.extensions.length, 1);
  const extension = result.extensions[0];
  const entries = [];
  const statuses = new Map();
  const widgets = new Map();
  result.runtime.appendEntry = (customType, data) => entries.push({ type: 'custom', customType, data });
  const ctx = {
    cwd, mode: 'tui', hasUI: true,
    sessionManager: { getBranch: () => entries },
    ui: {
      theme: { fg: (_color, text) => text },
      setStatus: (key, value) => statuses.set(key, value),
      setWidget: (key, value) => widgets.set(key, value),
      notify() {}, confirm: async () => false, editor: async () => undefined,
      setFooter() { throw new Error('extension must not replace the Pi footer'); },
    },
  };
  async function emit(name, event = {}, context = ctx) {
    const results = [];
    for (const handler of extension.handlers.get(name) ?? []) results.push(await handler({ type: name, ...event }, context));
    return results;
  }
  return { extension, runtime: result.runtime, emit, ctx, entries, statuses, widgets };
}

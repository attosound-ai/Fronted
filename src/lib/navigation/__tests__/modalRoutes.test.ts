import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { MODAL_ROUTES, presentedModal } from '../modalRoutes';

test('the list matches every modal presentation declared in the root layout', () => {
  const layout = readFileSync(resolve(process.cwd(), 'src/app/_layout.tsx'), 'utf8');
  const declared = new Set<string>();
  const screen = /<Stack\.Screen\s+name="([^"]+)"\s+options=\{\{([\s\S]*?)\}\}\s*\/>/g;
  for (const m of layout.matchAll(screen)) {
    const presentation = /presentation:\s*'([^']+)'/.exec(m[2])?.[1];
    if (presentation && /modal/i.test(presentation)) declared.add(m[1]);
  }
  assert.ok(declared.size > 0, 'the layout parser found no modal screen at all');
  assert.deepEqual([...MODAL_ROUTES].sort(), [...declared].sort());
});

test('the client stack of Oct 9 2026 has New Post presented', () => {
  assert.equal(presentedModal(['(tabs)', 'create-post']), 'create-post');
});

test('pushed screens are not modal', () => {
  assert.equal(presentedModal(['(tabs)', 'projects', 'project/[id]', 'chat']), null);
});

test('a modal under a pushed screen still counts', () => {
  assert.equal(presentedModal(['(tabs)', 'call', 'project/[id]']), 'call');
});

test('an empty stack has none', () => {
  assert.equal(presentedModal([]), null);
});

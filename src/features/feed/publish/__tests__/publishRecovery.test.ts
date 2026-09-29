import { test } from 'node:test';
import assert from 'node:assert/strict';

import { recoverJobs } from '../publishRecovery';

// Lo que pasó el 29 de septiembre de 2026: se cerró la app al 21% de un
// video y al volver la franja quedó congelada para siempre. Al reabrir,
// nada puede seguir "corriendo".
test('a job that was running comes back as interrupted', () => {
  for (const phase of ['preparing', 'uploading', 'posting']) {
    assert.deepEqual(recoverJobs([{ id: 'a', phase, progress: 0.21 }]), [
      { id: 'a', phase: 'interrupted', progress: 0.21 },
    ]);
  }
});

test('a posted job is gone, the rest stay as they were', () => {
  const jobs = [
    { id: 'done', phase: 'done' },
    { id: 'queued', phase: 'queued' },
    { id: 'failed', phase: 'failed' },
    { id: 'interrupted', phase: 'interrupted' },
  ];
  assert.deepEqual(
    recoverJobs(jobs).map((j) => `${j.id}:${j.phase}`),
    ['queued:queued', 'failed:failed', 'interrupted:interrupted']
  );
});

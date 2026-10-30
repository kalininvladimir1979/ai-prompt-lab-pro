import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAgentPackage } from '../server/agent-package.js';

const sample = () => ({
  format: 'prompt-lab-agent-package', version: 1, exportedAt: new Date().toISOString(),
  agent: { id: 'ai-recruiter', name: 'AI Recruiter', kind: 'recruiter' },
  prompt: { system: 'Screen vacancy and resume using verified evidence.', versionLabel: 'Current' },
  operations: [{ id: 'screen_candidate', title: 'Screen candidate', inputSchema: { type: 'object', additionalProperties: false, properties: { vacancyText: { type: 'string' }, resumeText: { type: 'string' } }, required: ['vacancyText', 'resumeText'] }, outputSchema: { type: 'object', required: ['score', 'decision', 'strengths', 'gaps', 'missing_information', 'evidence'] } }],
  constraints: ['No invented experience'],
  evaluation: { languages: ['ru', 'en', 'es'], criteria: ['evidence'], testCaseSchema: { vacancyText: 'string', resumeText: 'string' }, testCasesIncluded: false }
});

test('agent package produces a draft prompt and eval plan without cases', () => {
  const parsed = validateAgentPackage(sample());
  assert.equal(parsed.agent, 'recruiter');
  assert.equal(parsed.summary.operation, 'Screen candidate');
  assert.equal(parsed.evalPlan.evaluation.testCasesIncluded, false);
});

test('agent package rejects extra fields, cases, and oversized payloads', () => {
  assert.throws(() => validateAgentPackage({ ...sample(), apiKey: 'secret' }), /структура/);
  assert.throws(() => validateAgentPackage({ ...sample(), evaluation: { ...sample().evaluation, testCasesIncluded: true } }), /План eval/);
  assert.throws(() => validateAgentPackage({ ...sample(), prompt: { ...sample().prompt, system: 'x'.repeat(100001) } }), /100 КБ/);
});

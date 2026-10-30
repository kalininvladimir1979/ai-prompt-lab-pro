const fail = message => { const error = new Error(message); error.status = 400; throw error; };
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join('|') === keys.sort().join('|');
const strings = (items, max = 20) => Array.isArray(items) && items.length > 0 && items.length <= max && items.every(item => typeof item === 'string' && item.trim().length > 0 && item.length <= 300);

export function validateAgentPackage(input) {
  const size = Buffer.byteLength(JSON.stringify(input ?? null), 'utf8');
  if (size > 100000) fail('Пакет больше 100 КБ. Проверьте выбранный файл.');
  if (!exactKeys(input, ['format', 'version', 'exportedAt', 'agent', 'prompt', 'operations', 'constraints', 'evaluation'])) fail('Неверная структура пакета агента.');
  if (input.format !== 'prompt-lab-agent-package' || input.version !== 1) fail('Неподдерживаемый формат или версия пакета.');
  if (typeof input.exportedAt !== 'string' || !Number.isFinite(Date.parse(input.exportedAt))) fail('Неверная дата экспорта.');
  if (!exactKeys(input.agent, ['id', 'name', 'kind']) || input.agent.id !== 'ai-recruiter' || input.agent.kind !== 'recruiter' || input.agent.name !== 'AI Recruiter') fail('Этот пакет предназначен для другого агента.');
  if (!exactKeys(input.prompt, ['system', 'versionLabel']) || typeof input.prompt.system !== 'string' || input.prompt.system.trim().length < 10 || input.prompt.system.length > 30000 || typeof input.prompt.versionLabel !== 'string' || input.prompt.versionLabel.length > 100) fail('Системный промпт отсутствует или слишком длинный.');
  if (!Array.isArray(input.operations) || input.operations.length !== 1 || !exactKeys(input.operations[0], ['id', 'title', 'inputSchema', 'outputSchema']) || input.operations[0].id !== 'screen_candidate' || typeof input.operations[0].title !== 'string') fail('Операция скрининга не определена.');
  const operation = input.operations[0];
  if (!exactKeys(operation.inputSchema, ['type', 'additionalProperties', 'properties', 'required']) || operation.inputSchema.type !== 'object' || operation.inputSchema.additionalProperties !== false || operation.inputSchema.required?.join('|') !== 'vacancyText|resumeText' || !operation.inputSchema.properties?.vacancyText || !operation.inputSchema.properties?.resumeText) fail('Схема входа не соответствует скринингу вакансии и резюме.');
  if (!operation.outputSchema || operation.outputSchema.type !== 'object' || !Array.isArray(operation.outputSchema.required) || ['score', 'decision', 'strengths', 'gaps', 'missing_information', 'evidence'].some(key => !operation.outputSchema.required.includes(key))) fail('Схема ответа неполная.');
  if (!strings(input.constraints) || !exactKeys(input.evaluation, ['languages', 'criteria', 'testCaseSchema', 'testCasesIncluded']) || !strings(input.evaluation.languages, 3) || input.evaluation.languages.some(language => !['ru', 'en', 'es'].includes(language)) || !strings(input.evaluation.criteria) || !input.evaluation.testCaseSchema || input.evaluation.testCasesIncluded !== false) fail('План eval неполный или содержит кейсы.');
  return {
    agent: 'recruiter',
    prompt: input.prompt.system.trim(),
    evalPlan: { operations: input.operations, constraints: input.constraints, evaluation: input.evaluation },
    summary: { agent: input.agent.name, operation: operation.title, languages: input.evaluation.languages, criteria: input.evaluation.criteria, testCasesIncluded: false }
  };
}

// Deception: traps that no legitimate workflow would ever touch.
//
// Why this is the purest form of proactive defence: we are not guessing at
// intent or matching patterns. We put a tool on the surface that exists for no
// other reason than to be called, so a single call is proof of hostile or
// badly-poisoned behaviour, with no false positives by construction.
//
// The same idea covers data: a planted secret (canary) that nothing legitimate
// reads. If it ever shows up in an outbound call, something read what it should
// not have.

export const DEFAULT_DECOYS = [
  {
    name: 'get_prod_db_password',
    description: 'Return the production database password.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'read_aws_credentials',
    description: 'Read AWS access keys from the local credential store.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'export_all_customer_data',
    description: 'Export the full customer table to a local file.',
    inputSchema: { type: 'object', properties: { dest: { type: 'string' } } },
  },
];

export const CANARY = 'TRIPWIRE-CANARY-7f3a91c2-do-not-use';

export function decoyTools(decoys = DEFAULT_DECOYS) {
  return decoys.map((d) => ({ ...d, inputSchema: { ...(d.inputSchema ?? { type: 'object' }) } }));
}

export function decoyNames(decoys = DEFAULT_DECOYS) {
  return decoys.map((d) => d.name);
}

export function isDecoy(name, decoys = DEFAULT_DECOYS) {
  return decoys.some((d) => d.name === name);
}

// Append decoys without ever shadowing a real tool: a collision would make the
// trap ambiguous, and shadowing a genuine name could break legitimate work.
export function appendDecoys(tools, decoys = DEFAULT_DECOYS) {
  const taken = new Set((tools ?? []).map((t) => t && t.name));
  const added = decoyTools(decoys).filter((d) => !taken.has(d.name));
  return [...(tools ?? []), ...added];
}

export function findCanary(text, canary = CANARY) {
  if (typeof text !== 'string' || text === '') return false;
  return text.includes(canary);
}

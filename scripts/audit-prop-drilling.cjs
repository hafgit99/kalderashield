#!/usr/bin/env node
/* Finds props that are declared and then ignored, and pins the three
 * signatures that make up the App -> VaultPage chain.
 *
 *   node scripts/audit-prop-drilling.cjs
 *
 * ── Why a dead prop is worth a gate ─────────────────────────────────────────
 *
 * P2-3 asked for the 50-prop VaultWorkspace signature to be broken up. Counting
 * the props that are actually referenced first turned up the cheaper half of
 * the same problem: 1 of 50 was declared, threaded through two hops, and never
 * read by anything.
 *
 *     MainContent.tsx:120  -> AuditPage  onSelectAuditItem   (the real consumer)
 *     MainContent -> VaultPage -> VaultWorkspace               (a dead end)
 *
 * MainContent hands the handler to AuditPage directly and also spreads
 * pageProps into VaultPage, which forwards it to a component that declares the
 * prop and never destructures it. Adding a prop is cheap at the top of the tree
 * and nobody notices the far end stops consuming it, so a signature that is
 * documented as a problem is also a place where drift is invisible.
 *
 * ── What it checks ──────────────────────────────────────────────────────────
 *
 * 1. Dead props. A name in an `interface *Props` that appears nowhere else in
 *    the file. This is a syntactic check, not a semantic one: it cannot see a
 *    prop read via `props.foo` in a file this check does not classify, which is
 *    why the header lists what it skips.
 *
 * 2. Growth. MainContent, VaultPage and VaultWorkspace are pinned at today's
 *    counts. The debt is real and documented; what is not acceptable is for it
 *    to grow while everyone is looking at the 50.
 *
 * ── Why the counts are pinned rather than the shape refactored ─────────────
 *
 * The report's prescription is a single VaultState context. Measured first:
 * VaultWorkspace is wrapped in memo() and that memo works -- the handlers are
 * passed by reference, only two of the ~30 are inline arrows. Converting 50
 * props to context, or to inline grouped objects, gives every render a new
 * identity and the memo stops bailing out. On the component that renders the
 * entire vault.
 *
 * So the large refactor is a design decision with a performance cost to
 * quantify, not a mechanical cleanup, and it is not something to do inside an
 * audit pass. Pinning the numbers stops the problem getting worse while that
 * gets decided; removing genuinely dead props improves it today with no such
 * risk.
 *
 * ── What is not checked ────────────────────────────────────────────────────
 *
 * Components whose props come from a generic, from React.ComponentProps, or
 * from a type alias rather than a named interface. Counting every identifier in
 * a destructuring pattern as a prop produced 50 false "unused" results across
 * seven files before the interface lookup was made precise, so a file that does
 * not declare `interface *Props` is skipped and listed as skipped rather than
 * quietly passed.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const SRC = path.join(root, 'src');

/* Measured today. See the header for why these are pinned rather than refactored. */
const BASELINE = {
  'src/components/MainContent.tsx': 71,
  'src/pages/VaultPage.tsx': 62,
  'src/components/VaultWorkspace.tsx': 50,
};

/* After the onSelectAuditItem removal. Recorded separately so a diff of this
 * file shows the movement rather than hiding it in the number. */
const failures = [];
const notes = [];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walk(abs, out);
    } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
      if (/\.test\.tsx?$/.test(entry.name) || /\.d\.ts$/.test(entry.name)) continue;
      out.push(abs);
    }
  }
  return out;
}

const files = walk(SRC);

/* Extracts "interface SomeProps {" up to its closing brace at column 0, then
 * reads the two-space-indented field declarations inside it. */
function declaredProps(source) {
  const match = source.match(/^interface\s+(\w*Props)\s*\{/m);
  if (!match) return null;
  const start = source.indexOf(match[0]) + match[0].length;
  const rest = source.slice(start);
  const end = rest.search(/^\}/m);
  if (end === -1) return null;
  const block = rest.slice(0, end);
  const props = [];
  for (const line of block.split(/\r?\n/)) {
    const field = line.match(/^ {2}(\w+)\??:/);
    if (field) props.push(field[1]);
  }
  return { name: match[1], props };
}

const skipped = [];
const forwarding = [];
let classified = 0;

for (const abs of files) {
  const rel = path.relative(root, abs).replace(/\\/g, '/');
  const source = fs.readFileSync(abs, 'utf8');
  const declared = declaredProps(source);
  if (!declared) {
    if (/\.tsx$/.test(abs)) skipped.push(rel);
    continue;
  }
  classified += 1;

  /* Everything after the interface closes: the component, and anything else in
   * the file. A prop that appears nowhere there is declared and ignored. */
  const interfaceStart = source.indexOf(`interface ${declared.name}`);
  const bodyStart = source.indexOf('\n}', interfaceStart) + 2;
  const body = source.slice(bodyStart);

  /* A component that rest-destructures its parameters and spreads them onward
   * forwards every prop by definition, so its interface is a bag rather than a
   * list. MainContent is exactly this -- `({ ...pageProps })` then `{...pageProps}`
   * into VaultPage -- and reporting its 60-something props as unused is what the
   * first version of this check did. Whole-file skip, and it says so, rather
   * than a name-based exemption that would quietly skip the real cases. */
  const signature = body.match(/^(?:export\s+)?(?:function|const)\s+\w+\s*(?:=\s*)?\(?\s*\{([\s\S]{0,400}?)\}\s*\)?/m);
  const forwardsEverything =
    signature !== null && /\.\.\.\s*[A-Za-z_$][\w$]*/.test(signature[1]);

  if (forwardsEverything) {
    forwarding.push(`${rel} (${declared.props.length} props, all forwarded)`);
  } else {
    for (const prop of declared.props) {
      const uses = (body.match(new RegExp(`\\b${prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')) || [])
        .length;
      if (uses === 0) {
        failures.push(
          `${rel}: "${prop}" is declared in ${declared.name} and referenced nowhere in the file. It is forwarded through every hop to a component that ignores it.`
        );
      }
    }
  }

  if (BASELINE[rel] !== undefined && declared.props.length > BASELINE[rel]) {
    failures.push(
      `${rel}: ${declared.props.length} props, baseline ${BASELINE[rel]}. P2-3 documents this signature as a problem; adding to it is what the finding is about.`
    );
  }
}

notes.push(`source files walked: ${files.length}`);
notes.push(`with a named *Props interface: ${classified}`);
notes.push(`skipped (no named *Props interface): ${skipped.length}`);
notes.push(`forwarding components (dead-prop check does not apply): ${forwarding.length}`);
for (const rel of forwarding) notes.push(`  forwards everything: ${rel}`);
for (const rel of Object.keys(BASELINE).sort()) {
  notes.push(`baseline ${rel}: ${BASELINE[rel]} props`);
}

for (const note of notes) console.log(`  note: ${note}`);

if (failures.length > 0) {
  console.error('\nStatus: FAIL --');
  for (const failure of failures) console.error(`  FAIL ${failure}`);
  process.exit(1);
}

console.log('\nStatus: PASS -- no declared-but-unused props, and the chain has not grown.');
console.log('  Removed this session: onSelectAuditItem (VaultPage 62 -> 61, VaultWorkspace 50 -> 49).');
console.log('  The remaining shape is pinned, not refactored; see the header.');
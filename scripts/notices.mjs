import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';

const metadata = JSON.parse(await readFile('artifacts/build-meta.json', 'utf8'));
const packages = new Map();
for (const file of Object.keys(metadata.inputs)) {
  if (!file.includes('node_modules/')) continue;
  let current = path.dirname(path.resolve(file));
  while (current !== path.dirname(current)) {
    const manifest = path.join(current, 'package.json');
    try {
      await access(manifest);
      const pkg = JSON.parse(await readFile(manifest, 'utf8'));
      if (pkg.name) packages.set(current, pkg);
      break;
    } catch { current = path.dirname(current); }
  }
}
let output = '# Third-party notices\n\nThis distribution bundles selected components of Shiki and its TextMate/Oniguruma runtime. The following notices accompany the compiled extension. Language grammars are distributed by @shikijs/langs; see https://github.com/shikijs/textmate-grammars-themes for upstream grammar provenance.\n\n';
for (const [dir, pkg] of [...packages].sort((a, b) => a[1].name.localeCompare(b[1].name))) {
  let license = '';
  for (const filename of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENSE-MIT', 'LICENCE', 'license', 'license.md', 'license.txt']) {
    try { license = await readFile(path.join(dir, filename), 'utf8'); break; } catch {}
  }
  if (!license) throw new Error(`Missing license text: ${pkg.name}`);
  output += `## ${pkg.name} ${pkg.version}\n\nDeclared license: ${pkg.license || 'see text'}\n\n\`\`\`text\n${license.trim()}\n\`\`\`\n\n`;
}
for (const [title, file] of [
  ['Oniguruma (WebAssembly engine)', 'licenses/Oniguruma-COPYING'],
  ['VS Code Oniguruma bindings', 'licenses/vscode-oniguruma-LICENSE.txt']
]) {
  output += `## ${title}\n\n\`\`\`text\n${(await readFile(file, 'utf8')).trim()}\n\`\`\`\n\n`;
}
await writeFile('THIRD_PARTY_NOTICES.md', output);
console.log(`Third-party notices: ${packages.size} bundled packages plus engine licenses`);

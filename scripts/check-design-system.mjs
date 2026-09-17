import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import { parseSync } from 'rolldown/experimental';
import { renderTokenCss, outputPath } from './ui-token-css.mjs';

const literalColor = /#[\da-f]{3,8}\b|(?:rgba?|hsla?)\(\s*[\d.+-]/i;

export function inspectUiSource(file, source) {
  const issues = [];
  const add = (line, message) => issues.push(`${file}:${line}: ${message}`);
  if (file.endsWith('.css')) {
    const css = postcss.parse(source, { from: file });
    css.walkDecls(declaration => {
      const { prop, value } = declaration;
      const line = declaration.source?.start?.line ?? 1;
      if (prop === 'font-size' && !['inherit','initial','unset','0'].includes(value) && (!value.includes('var(--font-') || /\d(?:px|rem|em|vw)\b/.test(value))) add(line, 'Use a shared --font-* role.');
      if (prop === 'font' && /\d(?:px|rem|em)\b/.test(value)) add(line, 'Use shared font roles in font shorthand.');
      if (prop === 'border-radius' && !/^(?:0|50%|inherit|initial|unset)$/.test(value) && (!value.includes('var(--radius-') || /\d(?:px|rem|em)\b/.test(value))) add(line, 'Use a shared --radius-* role.');
      if (literalColor.test(value)) add(line, 'UI colors belong in packages/ui/src/tokens.json.');
      const selector = declaration.parent.selector ?? '';
      if (selector.includes('.pl-select-control') && /^(?:padding|border|background|box-shadow|font|line-height|height|min-height|outline|color)(?:-|$)/.test(prop)) add(line, 'SelectField wrapper is layout-only; style the shared control through theme tokens.');
    });
  } else {
    const parsed = parseSync(file, source);
    const lineOf = node => source.slice(0,node.start ?? 0).split('\n').length;
    for (const error of parsed.errors) add(1, `Cannot check invalid source: ${error.message}`);
    const testFile = /\.test\.[cm]?[jt]sx?$/.test(file);
    function visit(node, inStyle = false, inArtworkPalette = false) {
      if (!node || typeof node !== 'object') return;
      if ((node.type === 'ImportDeclaration' || node.type === 'ImportExpression') && /^(?:antd(?:\/|$)|@radix-ui\/react-dialog$)/.test(node.source?.value ?? '')) add(lineOf(node), 'Import application primitives from @petlord/ui.');
      // Appearance checks belong to JSX styles, never arbitrary artwork/media data objects.
      if (inStyle && node.type === 'Property' && node.value?.type === 'Literal') {
        const prop = node.key?.name ?? node.key?.value;
        const value = node.value.value;
        if (['fontSize','borderRadius'].includes(prop) && value !== 0 && !(prop === 'borderRadius' && value === '50%') && /^(?:\d|[.])/.test(String(value))) add(lineOf(node), 'Use semantic CSS tokens for UI font sizes and radii.');
        if (!inArtworkPalette && typeof value === 'string' && literalColor.test(value)) add(lineOf(node), 'UI colors belong in packages/ui/src/tokens.json.');
      }
      if (!testFile && node.type === 'JSXOpeningElement') {
        const name = node.name?.name;
        const attribute = key => { const a = node.attributes.find(a => a.type === 'JSXAttribute' && a.name.name === key); return a?.value?.value ?? a?.value?.expression?.value; };
        if (name === 'textarea') add(lineOf(node), 'Use shared TextArea.');
        if (name === 'select') add(lineOf(node), 'Use shared SelectField; native select bridges belong inside @petlord/ui.');
        if (name === 'input' && !['file','range','color','hidden'].includes(attribute('type'))) add(lineOf(node), 'Use shared Input, Checkbox or Radio; native inputs are limited to file/range/color/hidden.');
        if (name === 'button' && /\b(?:primary|secondary|ghost|compact|icon)-button\b/.test(attribute('className') ?? '')) add(lineOf(node), 'Use shared Button for standard actions.');
      }
      const childInStyle = inStyle || (node.type === 'JSXAttribute' && node.name?.name === 'style');
      // This existing palette previews artwork colors; its contrasting swatch ink is content.
      // Keep the exemption local: the surrounding pixel editor UI still uses shared tokens.
      const childInArtworkPalette = inArtworkPalette || (file === 'apps/studio/src/pixel/NativePixelWorkspace.tsx' && node.type === 'JSXElement' && node.openingElement.attributes.some(attribute => attribute.type === 'JSXAttribute' && attribute.name?.name === 'className' && attribute.value?.value === 'native-palette'));
      for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(child => visit(child, childInStyle, childInArtworkPalette)); else if (value && typeof value === 'object') visit(value, childInStyle, childInArtworkPalette);
    }
    visit(parsed.program);
  }
  return issues;
}
async function filesUnder(directory) {
  const paths=[];
  for(const item of await readdir(directory,{withFileTypes:true})) {
    const path=resolve(directory,item.name);
    if(item.isDirectory())paths.push(...await filesUnder(path));
    else if(/\.(?:css|tsx?|jsx?)$/.test(item.name))paths.push(path);
  }
  return paths;
}
export async function checkDesignSystem() {
  const root = fileURLToPath(new URL('../',import.meta.url));
  const issues=[];
  for(const sourceRoot of ['apps/studio/src','apps/desktop/src'])for(const file of await filesUnder(resolve(root,sourceRoot)))issues.push(...inspectUiSource(relative(root,file),await readFile(file,'utf8')));
  if(await readFile(outputPath,'utf8')!==await renderTokenCss())issues.push('Generated UI token CSS is stale; run npm run tokens:ui.');
  return issues;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]) {
  const issues=await checkDesignSystem();
  if(issues.length){process.stderr.write(issues.join('\n')+'\n');process.exitCode=1;}
  else process.stdout.write('Design system check passed: shared tokens, primitive imports and SelectField layout boundary.\n');
}

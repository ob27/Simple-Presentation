import type { RichTextParagraph, RichTextRun } from '../types/shapes';

export function plainTextFromRichText(paragraphs: RichTextParagraph[]): string {
  return paragraphs.map(p => p.runs.map(r => r.text).join('')).join('\n');
}

// Legacy migration path: every Text shape before this feature only has a
// plain `label` string — split it into one plain paragraph per line so the
// editor has something structured to start from on first edit.
export function richTextFromLabel(label: string): RichTextParagraph[] {
  const lines = label.length > 0 ? label.split('\n') : [''];
  return lines.map(line => ({ runs: [{ text: line }] }));
}

function rgbToHex(rgb: string): string | undefined {
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return undefined;
  return '#' + [m[1], m[2], m[3]].map(n => Number(n).toString(16).padStart(2, '0')).join('');
}

// Reads a single text node's *effective* formatting via getComputedStyle on
// its parent element — this resolves correctly regardless of whether the
// browser's execCommand output used legacy tags (<b>/<u>/<strike>) or CSS
// spans (style="font-weight:bold"), since both compute the same way.
function runStyleAt(textNode: Text, baseColorHex: string): Omit<RichTextRun, 'text'> {
  const el = textNode.parentElement;
  if (!el) return {};
  const cs = getComputedStyle(el);
  const style: Omit<RichTextRun, 'text'> = {};
  if (Number(cs.fontWeight) >= 600 || cs.fontWeight === 'bold') style.bold = true;
  if (cs.fontStyle === 'italic') style.italic = true;
  const decoration = cs.textDecorationLine || cs.textDecoration;
  if (decoration.includes('underline')) style.underline = true;
  if (decoration.includes('line-through')) style.strikethrough = true;
  const hex = rgbToHex(cs.color);
  if (hex && hex.toLowerCase() !== baseColorHex.toLowerCase()) style.color = hex;
  return style;
}

function sameRunStyle(a: Omit<RichTextRun, 'text'>, b: Omit<RichTextRun, 'text'>): boolean {
  return !!a.bold === !!b.bold && !!a.italic === !!b.italic && !!a.underline === !!b.underline
    && !!a.strikethrough === !!b.strikethrough && (a.color ?? '') === (b.color ?? '');
}

function collectRuns(block: HTMLElement, baseColorHex: string): RichTextRun[] {
  const runs: RichTextRun[] = [];
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  // eslint-disable-next-line no-cond-assign
  while ((node = walker.nextNode())) {
    const textNode = node as Text;
    const text = textNode.data;
    if (text.length === 0) continue;
    const style = runStyleAt(textNode, baseColorHex);
    const last = runs[runs.length - 1];
    if (last && sameRunStyle(last, style)) {
      last.text += text;
    } else {
      runs.push({ text, ...style });
    }
  }
  return runs.length > 0 ? runs : [{ text: '' }];
}

function listTypeOf(el: Element): 'bullet' | 'ordered' | undefined {
  if (el.tagName === 'UL') return 'bullet';
  if (el.tagName === 'OL') return 'ordered';
  return undefined;
}

// Parses the live contentEditable DOM back into structured paragraphs.
// Assumes `defaultParagraphSeparator` was set to 'div' and every paragraph
// was seeded as its own top-level <div>/<ul>/<ol> (see buildEditableDom) —
// under that assumption every top-level child is one block, so this never
// needs to guess at bare/unwrapped top-level text. One wrinkle Chromium
// actually produces: converting a non-first line to a list sometimes leaves
// the new <ul>/<ol> wrapped in the line's original <div> instead of
// replacing it outright — `unwrapList` below looks one level inside a plain
// <div>/<p> for exactly that case so it's still read as a list, not a
// single flattened paragraph.
function unwrapList(el: HTMLElement): { list: 'bullet' | 'ordered'; el: HTMLElement } | undefined {
  const direct = listTypeOf(el);
  if (direct) return { list: direct, el };
  if ((el.tagName === 'DIV' || el.tagName === 'P') && el.children.length === 1) {
    const only = listTypeOf(el.children[0]);
    if (only) return { list: only, el: el.children[0] as HTMLElement };
  }
  return undefined;
}

export function parseEditableElement(root: HTMLElement, baseColorHex: string): RichTextParagraph[] {
  const paragraphs: RichTextParagraph[] = [];
  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = (child as Text).data;
      if (text.trim().length === 0) continue;
      paragraphs.push({ runs: [{ text }] });
      continue;
    }
    if (!(child instanceof HTMLElement)) continue;
    const unwrapped = unwrapList(child);
    if (unwrapped) {
      for (const li of Array.from(unwrapped.el.children)) {
        if (li instanceof HTMLElement) paragraphs.push({ runs: collectRuns(li, baseColorHex), listType: unwrapped.list });
      }
    } else {
      paragraphs.push({ runs: collectRuns(child, baseColorHex) });
    }
  }
  return paragraphs.length > 0 ? paragraphs : [{ runs: [{ text: '' }] }];
}

function applyRunStyle(span: HTMLElement, run: RichTextRun) {
  if (run.bold) span.style.fontWeight = 'bold';
  if (run.italic) span.style.fontStyle = 'italic';
  const decorations: string[] = [];
  if (run.underline) decorations.push('underline');
  if (run.strikethrough) decorations.push('line-through');
  if (decorations.length > 0) span.style.textDecoration = decorations.join(' ');
  if (run.color) span.style.color = run.color;
}

function buildParagraphContent(container: HTMLElement, runs: RichTextRun[]) {
  for (const run of runs) {
    const span = document.createElement('span');
    span.textContent = run.text;
    applyRunStyle(span, run);
    container.appendChild(span);
  }
}

// Imperatively seeds the contentEditable root from structured paragraphs —
// deliberately not React-rendered/dangerouslySetInnerHTML, since once a
// contentEditable is live the browser owns its DOM; React re-rendering it
// on every keystroke would fight the browser's own selection/cursor state.
export function buildEditableDom(root: HTMLElement, paragraphs: RichTextParagraph[]) {
  root.innerHTML = '';
  let i = 0;
  while (i < paragraphs.length) {
    const p = paragraphs[i];
    if (p.listType) {
      const list = document.createElement(p.listType === 'bullet' ? 'ul' : 'ol');
      list.style.margin = '0';
      list.style.paddingLeft = '1.4em';
      while (i < paragraphs.length && paragraphs[i].listType === p.listType) {
        const li = document.createElement('li');
        buildParagraphContent(li, paragraphs[i].runs);
        list.appendChild(li);
        i++;
      }
      root.appendChild(list);
    } else {
      const div = document.createElement('div');
      if (p.runs.length === 0 || (p.runs.length === 1 && p.runs[0].text === '')) {
        div.appendChild(document.createElement('br'));
      } else {
        buildParagraphContent(div, p.runs);
      }
      root.appendChild(div);
      i++;
    }
  }
}

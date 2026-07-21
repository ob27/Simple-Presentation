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

// Walks TEXT nodes and <br> elements only, REJECTing (not just skipping) any
// descendant <ul>/<ol> so a nested sub-list's own text never gets pulled
// into its parent <li>'s runs — the same call works for a plain <div> block
// (which never contains a nested list) and for a list-item <li> (which,
// once Tab-indent creates a nested sub-list inside it, would otherwise have
// its child list's text wrongly merged in). A <br> (a real Shift+Enter soft
// line break) becomes a literal '\n' appended into the current run's text —
// previously it was silently dropped (SHOW_TEXT-only walk), which is why a
// soft break inside a bullet looked fine while editing but collapsed back
// to one line once committed.
function collectRuns(block: HTMLElement, baseColorHex: string): RichTextRun[] {
  const runs: RichTextRun[] = [];
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode(n: Node) {
      if (n.nodeType === Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT;
      const el = n as Element;
      if (el.tagName === 'BR') return NodeFilter.FILTER_ACCEPT;
      if (el.tagName === 'UL' || el.tagName === 'OL') return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_SKIP;
    },
  });
  let node: Node | null;
  // eslint-disable-next-line no-cond-assign
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (runs.length === 0) runs.push({ text: '\n' });
      else runs[runs.length - 1].text += '\n';
      continue;
    }
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

// One wrinkle Chromium actually produces: converting a non-first line to a
// list sometimes leaves the new <ul>/<ol> wrapped in the line's original
// <div> instead of replacing it outright — this looks one level inside a
// plain <div>/<p> for exactly that case so it's still read as a list, not a
// single flattened paragraph.
function unwrapList(el: HTMLElement): HTMLElement | undefined {
  if (listTypeOf(el)) return el;
  if ((el.tagName === 'DIV' || el.tagName === 'P') && el.children.length === 1) {
    const only = el.children[0] as HTMLElement;
    if (listTypeOf(only)) return only;
  }
  return undefined;
}

// Recursively flattens a (possibly Tab-indent-nested) <ul>/<ol> into the
// flat `indentLevel`-tagged array Tab-indent (#4) needs. Chromium's own
// execCommand('indent') does NOT nest the sub-list inside the preceding
// <li> the way markup authored by hand normally would — empirically it
// appends the new <ul>/<ol> as a direct child of the SAME parent <ul>,
// immediately after the <li> it continues (so the parent <ul> ends up with
// an <li> followed by a nested <ul> as siblings). This walks each list's
// direct children and treats any non-<li> nested <ul>/<ol> it finds as the
// continuation of whichever <li> came right before it, at `level + 1` —
// while still also checking one level inside a plain <li> (some browsers,
// or hand-authored content, may nest it there instead).
function parseList(listEl: Element, level: number, baseColorHex: string, out: RichTextParagraph[]): void {
  const listType = listTypeOf(listEl);
  if (!listType) return;
  for (const child of Array.from(listEl.children)) {
    if (!(child instanceof HTMLElement)) continue;
    if (listTypeOf(child)) {
      parseList(child, level + 1, baseColorHex, out);
      continue;
    }
    if (child.tagName !== 'LI') continue;
    out.push({ runs: collectRuns(child, baseColorHex), listType, indentLevel: level });
    for (const nested of Array.from(child.children)) {
      if (listTypeOf(nested)) parseList(nested, level + 1, baseColorHex, out);
    }
  }
}

// Parses the live contentEditable DOM back into structured paragraphs.
// Assumes `defaultParagraphSeparator` was set to 'div' and every top-level
// paragraph was seeded as its own <div>/<ul>/<ol> (see buildEditableDom) —
// under that assumption every top-level child is one block, so this never
// needs to guess at bare/unwrapped top-level text.
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
      parseList(unwrapped, 0, baseColorHex, paragraphs);
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

// A run's `text` may contain embedded '\n' (a Shift+Enter soft break parsed
// by collectRuns above) — split on it and insert a real <br> between the
// pieces, all still inside the SAME <span> so style/read-back stays
// consistent and re-editing sees genuine <br> elements again.
function buildParagraphContent(container: HTMLElement, runs: RichTextRun[]) {
  for (const run of runs) {
    const span = document.createElement('span');
    applyRunStyle(span, run);
    const lines = run.text.split('\n');
    lines.forEach((line, idx) => {
      if (idx > 0) span.appendChild(document.createElement('br'));
      if (line.length > 0) span.appendChild(document.createTextNode(line));
    });
    container.appendChild(span);
  }
}

function newListElement(listType: 'bullet' | 'ordered'): HTMLElement {
  const list = document.createElement(listType === 'bullet' ? 'ul' : 'ol');
  list.style.margin = '0';
  list.style.paddingLeft = '1.4em';
  // Matches RichTextDisplay's committed rendering exactly (also hardcoded
  // left) — the shape's own textAlign otherwise leaks onto the list while
  // editing (inherited from the contentEditable root) and then visibly
  // snaps left the moment it's committed, which is what made bullets look
  // "off" only while editing.
  list.style.textAlign = 'left';
  return list;
}

// Imperatively seeds the contentEditable root from structured paragraphs —
// deliberately not React-rendered/dangerouslySetInnerHTML, since once a
// contentEditable is live the browser owns its DOM; React re-rendering it
// on every keystroke would fight the browser's own selection/cursor state.
//
// List paragraphs are seeded as genuine nested <ul>/<ol> (a flat array with
// `indentLevel` built into a tree via a small open-list stack — the classic
// "flat + depth -> nested" construction), so Tab-indented sub-items round-
// trip as real sub-lists rather than a flat visual-only indent. The nested
// list is appended as a direct child of its PARENT <ul>/<ol> (a sibling of
// the <li> it continues), not wrapped inside that <li> — matching the exact
// shape Chromium's own execCommand('indent') produces (confirmed
// empirically), so Tab/Shift+Tab keep behaving correctly if the user
// indents/outdents further on a later edit.
export function buildEditableDom(root: HTMLElement, paragraphs: RichTextParagraph[]) {
  root.innerHTML = '';
  let i = 0;
  while (i < paragraphs.length) {
    const p = paragraphs[i];
    if (p.listType) {
      const stack: { el: HTMLElement; level: number }[] = [];
      while (i < paragraphs.length && paragraphs[i].listType) {
        const cur = paragraphs[i];
        const level = cur.indentLevel ?? 0;
        const listType = cur.listType!;
        while (stack.length > 0 && stack[stack.length - 1].level > level) stack.pop();
        let top = stack[stack.length - 1];
        if (!top || top.level < level) {
          const list = newListElement(listType);
          (top ? top.el : root).appendChild(list);
          const frame = { el: list, level };
          stack.push(frame);
          top = frame;
        } else if (top.el.tagName !== (listType === 'bullet' ? 'UL' : 'OL')) {
          // List type changed at the same nesting level (e.g. bullet ->
          // numbered) — start a fresh sibling list rather than mixing <li>
          // tags under the wrong parent tag.
          const list = newListElement(listType);
          (top.el.parentElement ?? root).appendChild(list);
          const frame = { el: list, level };
          stack[stack.length - 1] = frame;
          top = frame;
        }
        const li = document.createElement('li');
        buildParagraphContent(li, cur.runs);
        top.el.appendChild(li);
        i++;
      }
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

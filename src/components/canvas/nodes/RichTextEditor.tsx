import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  IconBold, IconItalic, IconUnderline, IconStrikethrough,
  IconUnorderedList, IconOrderedList,
} from '../../icons';
import type { RichTextParagraph } from '../../../types/shapes';
import { buildEditableDom, parseEditableElement } from '../../../utils/richText';
import { ColorPickerField } from '../../panels/ColorPickerField';

interface Props {
  paragraphs: RichTextParagraph[];
  baseStyle: React.CSSProperties;
  baseColorHex: string;
  textAlign: 'left' | 'center' | 'right' | 'justify';
  onCommit: (paragraphs: RichTextParagraph[], plainText: string) => void;
  onCancel: () => void;
}

const TOOLBAR_BUTTONS: Array<{ command: string; icon: React.ReactNode; title: string }> = [
  { command: 'bold', icon: <IconBold />, title: 'Bold (Ctrl/Cmd+B)' },
  { command: 'italic', icon: <IconItalic />, title: 'Italic (Ctrl/Cmd+I)' },
  { command: 'underline', icon: <IconUnderline />, title: 'Underline (Ctrl/Cmd+U)' },
  { command: 'strikeThrough', icon: <IconStrikethrough />, title: 'Strikethrough' },
  { command: 'insertUnorderedList', icon: <IconUnorderedList />, title: 'Bulleted list' },
  { command: 'insertOrderedList', icon: <IconOrderedList />, title: 'Numbered list' },
];

// Multi-line, multi-run text editing for Text-kind shapes — a real
// contentEditable surface (not the plain single-line <input> every other
// shape kind still uses) plus a small floating toolbar for per-selection
// bold/italic/underline/strike/color and bullet/numbered lists, using the
// browser's own execCommand + selection handling rather than a new editor
// dependency (no rich-text library was installed in this project, and the
// commands this needs are still fully supported in Chromium/Firefox).
export function RichTextEditor({ paragraphs, baseStyle, baseColorHex, textAlign, onCommit, onCancel }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const cancelledRef = useRef(false);
  const savedRangeRef = useRef<Range | null>(null);
  // Anchored `bottom: 100%` by default; flips to `top: 100%` when there
  // isn't enough room above the shape (e.g. it sits near the top of the
  // viewport) so the toolbar doesn't render partially off-screen or flush
  // against the box it's editing. A one-time measurement at toolbar-show is
  // enough — the shape doesn't move while text-editing, so no need to keep
  // re-measuring like a live-tracking tooltip would.
  const [toolbarPlacement, setToolbarPlacement] = useState<'above' | 'below'>('above');
  useLayoutEffect(() => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (rect && rect.top < 40) setToolbarPlacement('below');
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    document.execCommand('defaultParagraphSeparator', false, 'div');
    buildEditableDom(root, paragraphs);
    root.focus();
    // Place the cursor at the end of the seeded content rather than the start.
    const range = document.createRange();
    range.selectNodeContents(root);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function commit() {
    const root = rootRef.current;
    if (!root) return;
    const parsed = parseEditableElement(root, baseColorHex);
    onCommit(parsed, parsed.map(p => p.runs.map(r => r.text).join('')).join('\n'));
  }

  // The color popover's hex input is a real focusable element the user can
  // land on (e.g. after pressing Enter in it) without the contentEditable
  // ever regaining focus — so a plain onBlur on the contentEditable can't
  // reliably catch "the user clicked truly outside this shape" in every
  // case. A capture-phase document listener does: it fires on every click
  // regardless of what currently has focus, and the wrapperRef containment
  // check (which also covers the popover, portaled inside wrapperRef via
  // getPopupContainer) still tells apart "inside the editor" from "outside."
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (cancelledRef.current) return;
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) commit();
    }
    document.addEventListener('mousedown', onDocMouseDown, true);
    return () => document.removeEventListener('mousedown', onDocMouseDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={wrapperRef} className="nodrag nopan" style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div
        className="nodrag nopan"
        onMouseDown={e => e.preventDefault()}
        style={{
          position: 'absolute', left: '50%', transform: 'translateX(-50%)',
          ...(toolbarPlacement === 'above' ? { bottom: '100%', marginBottom: 4 } : { top: '100%', marginTop: 4 }),
          display: 'flex', gap: 2, background: '#fff', border: '1px solid #e6e8ef', borderRadius: 6,
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)', padding: 3, zIndex: 20, whiteSpace: 'nowrap',
        }}
      >
        {TOOLBAR_BUTTONS.map(b => (
          <button
            key={b.command}
            type="button"
            title={b.title}
            // preventDefault on mousedown keeps focus (and the current
            // selection/caret) on the contentEditable the entire time — the
            // button click never blurs it, so execCommand acts on exactly
            // what the user had selected/where they were typing. Do NOT
            // re-focus() afterward: focusing an element that never lost
            // focus resets the caret to the start of its content instead of
            // leaving it where execCommand left it.
            onMouseDown={e => e.preventDefault()}
            onClick={() => {
              document.execCommand(b.command);
              // insertUnorderedList/insertOrderedList leave the caret at
              // the START of the new <li> rather than where the user was
              // typing — a real execCommand quirk, not just a test
              // artifact. Explicitly move it back to the end of that <li>.
              if (b.command === 'insertUnorderedList' || b.command === 'insertOrderedList') {
                const sel = window.getSelection();
                const node = sel?.rangeCount ? sel.getRangeAt(0).startContainer : null;
                const li = (node instanceof Element ? node : node?.parentElement)?.closest('li');
                if (sel && li) {
                  const r = document.createRange();
                  r.selectNodeContents(li);
                  r.collapse(false);
                  sel.removeAllRanges();
                  sel.addRange(r);
                }
              }
            }}
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 4,
              width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
            }}
          >
            {b.icon}
          </button>
        ))}
        <div
          // Same preventDefault-keeps-focus trick as the buttons above (also
          // stops this trigger's own click from blurring the contentEditable
          // and committing early) — but the color POPOVER's swatches, once
          // open, are a separate portal the mousedown guard can't reach, so
          // the selection is saved here and explicitly restored right before
          // applying the picked color.
          onMouseDown={e => { e.preventDefault(); savedRangeRef.current = window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0).cloneRange() : null; }}
        >
          <ColorPickerField
            value={baseColorHex}
            getPopupContainer={() => wrapperRef.current!}
            onChangeComplete={hex => {
              const sel = window.getSelection();
              if (sel && savedRangeRef.current) {
                sel.removeAllRanges();
                sel.addRange(savedRangeRef.current);
              }
              rootRef.current?.focus();
              document.execCommand('foreColor', false, hex);
            }}
          />
        </div>
      </div>
      <div
        ref={rootRef}
        contentEditable
        suppressContentEditableWarning
        className="nodrag nopan"
        onKeyDown={e => {
          if (e.key === 'Escape') { cancelledRef.current = true; onCancel(); }
          // Only steal Tab when the caret is inside a list item — nests (or
          // un-nests) it into a real sub-list via the browser's own
          // execCommand, which already knows how to restructure <li>/<ul>
          // correctly for a contentEditable. Outside a list, Tab is left
          // alone so it still does its normal focus-move thing.
          if (e.key === 'Tab') {
            const sel = window.getSelection();
            const anchor = sel?.anchorNode;
            const anchorEl = anchor instanceof Element ? anchor : anchor?.parentElement;
            const li = anchorEl?.closest('li');
            if (li) {
              e.preventDefault();
              // execCommand('indent') is a no-op on a list's FIRST <li> —
              // there's no preceding sibling to nest under, so the browser
              // simply does nothing (a real execCommand limitation, not a
              // bug in this handler). Give it one to nest under: insert a
              // temporary empty leading <li>, indent (now a normal case the
              // browser handles correctly), then remove the placeholder.
              const isFirstChild = !e.shiftKey && !li.previousElementSibling;
              let placeholder: HTMLLIElement | null = null;
              if (isFirstChild) {
                placeholder = document.createElement('li');
                li.parentElement?.insertBefore(placeholder, li);
              }
              document.execCommand(e.shiftKey ? 'outdent' : 'indent');
              placeholder?.remove();
            }
          }
          e.stopPropagation();
        }}
        style={{
          width: '100%', textAlign, outline: 'none', background: 'transparent', cursor: 'text',
          ...baseStyle,
        }}
      />
    </div>
  );
}

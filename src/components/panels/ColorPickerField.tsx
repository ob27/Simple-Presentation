import { useState } from 'react';
import { ColorPicker, Tooltip, Button } from 'antd';
import { IconEyedropper } from '../icons';
import { getRecentColors, addRecentColor } from '../../utils/colorSwatches';

// The native EyeDropper API (Chromium-only as of writing — Safari/Firefox
// don't implement it) isn't yet in every TS DOM lib version, so it's typed
// minimally here rather than assumed to exist on `Window`.
interface EyeDropperResult { sRGBHex: string }
interface EyeDropperConstructor { new (): { open(): Promise<EyeDropperResult> } }
function getEyeDropper(): EyeDropperConstructor | undefined {
  return (window as unknown as { EyeDropper?: EyeDropperConstructor }).EyeDropper;
}

interface Props {
  value: string;
  onChangeComplete: (hex: string) => void;
  // Overrides where the popover portals to — RichTextEditor's floating
  // toolbar passes its own wrapper here so the (focus-stealing) popover
  // content lands inside a container its blur-detection already treats as
  // "still part of the editor," instead of the default document.body.
  getPopupContainer?: () => HTMLElement;
}

// Thin wrapper around antd's ColorPicker shared by every fill/stroke/font
// color field in the properties panel — adds a "Recent" swatch presets
// list (shared across every instance of this component, not per-field) and,
// where supported, a screen eyedropper button.
export function ColorPickerField({ value, onChangeComplete, getPopupContainer }: Props) {
  const [recent, setRecent] = useState(getRecentColors);
  const eyeDropperCtor = getEyeDropper();

  function commit(hex: string) {
    onChangeComplete(hex);
    setRecent(addRecentColor(hex));
  }

  async function handleEyeDropper() {
    if (!eyeDropperCtor) return;
    try {
      const result = await new eyeDropperCtor().open();
      commit(result.sRGBHex);
    } catch {
      // User pressed Escape / cancelled the pick — nothing to do.
    }
  }

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <ColorPicker
        value={value}
        presets={recent.length > 0 ? [{ label: 'Recent', colors: recent }] : undefined}
        onChangeComplete={c => commit(c.toHexString())}
        getPopupContainer={getPopupContainer}
        showText
      />
      {eyeDropperCtor && (
        <Tooltip title="Pick color from screen">
          <Button size="small" type="text" icon={<IconEyedropper />} onClick={handleEyeDropper} />
        </Tooltip>
      )}
    </div>
  );
}

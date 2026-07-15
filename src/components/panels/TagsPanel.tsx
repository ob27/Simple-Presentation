import { Button, Switch } from 'antd';
import { IconClose } from '../icons';
import { PeekableDrawer } from './PeekableDrawer';

interface Props {
  allTags: string[];
  hiddenTags: Set<string>;
  onToggleTagVisibility: (tag: string) => void;
  onClose: () => void;
}

export function TagsPanel({ allTags, hiddenTags, onToggleTagVisibility, onClose }: Props) {
  return (
    <PeekableDrawer>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #f0f0f0' }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: '#1a1a2e' }}>Tags</span>
        <Button size="small" type="text" icon={<IconClose />} onClick={onClose} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 11, color: '#aaa' }}>
          Tags are set per-shape in its properties panel. Hiding a tag here is just a local view filter — it never changes the document.
        </div>
        {allTags.length === 0 ? (
          <div style={{ fontSize: 12, color: '#999' }}>No tags used yet</div>
        ) : allTags.map(tag => (
          <div key={tag} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13 }}>{tag}</span>
            <Switch size="small" checked={!hiddenTags.has(tag)} onChange={() => onToggleTagVisibility(tag)} />
          </div>
        ))}
      </div>
    </PeekableDrawer>
  );
}

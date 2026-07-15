import type { CSSProperties } from 'react';

interface Props {
  seed: string;
  size?: number;
  photoURL?: string | null;
  ring?: string;
  style?: CSSProperties;
}

// Matches Simple AIM Kanban's UserAvatar exactly (same DiceBear style/seed
// convention, same photo/ring/style superset) so a user's avatar looks the
// same across every product. `photoURL` (a resized profile photo, once set)
// always wins over the generated image.
export function CommentAvatar({ seed, size = 28, photoURL, ring, style }: Props) {
  const src = photoURL || `https://api.dicebear.com/10.x/notionists-neutral/svg?seed=${encodeURIComponent(seed)}`;
  return (
    <img
      src={src}
      width={size}
      height={size}
      style={{
        borderRadius: '50%', background: '#f0f0f0', objectFit: 'cover', flexShrink: 0,
        outline: ring ? `2px solid ${ring}` : undefined,
        outlineOffset: ring ? 1 : undefined,
        ...style,
      }}
      alt=""
    />
  );
}

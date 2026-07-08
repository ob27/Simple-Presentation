interface Props {
  seed: string;
  size?: number;
}

// Matches Simple AIM Kanban's UserAvatar exactly (same DiceBear style/seed
// convention) so a user's avatar looks the same across both apps.
export function CommentAvatar({ seed, size = 28 }: Props) {
  return (
    <img
      src={`https://api.dicebear.com/10.x/notionists-neutral/svg?seed=${encodeURIComponent(seed)}`}
      width={size}
      height={size}
      style={{ borderRadius: '50%', background: '#f0f0f0', objectFit: 'cover', flexShrink: 0 }}
      alt=""
    />
  );
}

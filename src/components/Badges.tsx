import { platformHue, ratingTier } from '../lib/format';

export function PlatformBadge({ platform }: { platform: string }) {
  return (
    <span className="badge badge-platform" style={{ '--hue': platformHue(platform) } as React.CSSProperties}>
      {platform}
    </span>
  );
}

export function RatingBadge({ rating }: { rating: number | null }) {
  return <span className={`rating rating-${ratingTier(rating)}`}>{rating ?? '—'}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  return <span className={`status status-${status.toLowerCase().replace(/\s+/g, '-')}`}>{status}</span>;
}

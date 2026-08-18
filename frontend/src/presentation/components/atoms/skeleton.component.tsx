/**
 * A shimmering placeholder.
 *
 * `aria-hidden` and `role="presentation"`: a screen reader announcing eight empty
 * boxes is noise. The loading *state* is announced once by the container's
 * `aria-busy`, which is the accessible equivalent of the shimmer.
 */
export function Skeleton({ width = '100%', height = 16 }: { readonly width?: string; readonly height?: number }) {
  return <div className="skeleton" style={{ width, height }} role="presentation" aria-hidden="true" />;
}

/** The jobs table's loading placeholder. Mirrors the real table's column layout. */
export function JobsTableSkeleton({ rows = 6 }: { readonly rows?: number }) {
  return (
    <div className="card" aria-busy="true" aria-live="polite" data-testid="jobs-table-skeleton">
      <span className="visually-hidden">Loading jobs…</span>

      <div style={{ display: 'grid', gap: 12 }}>
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 120px', gap: 12 }}>
            <Skeleton />
            <Skeleton />
            <Skeleton />
            <Skeleton />
            <Skeleton width="80px" />
          </div>
        ))}
      </div>
    </div>
  );
}

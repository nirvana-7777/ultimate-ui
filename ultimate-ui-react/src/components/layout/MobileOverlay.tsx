export function MobileOverlay({
  active,
  onClick,
}: {
  active: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className={`mobile-overlay ${active ? 'active' : ''}`}
      onClick={onClick}
      aria-hidden="true"
    />
  );
}

export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <img
      src="/youssefco-mark.svg"
      alt=""
      aria-hidden="true"
      className={className}
      draggable={false}
    />
  );
}

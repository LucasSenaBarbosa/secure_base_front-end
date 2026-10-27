export function Logo({ size = 42 }: { size?: number }) {
  return (
    <img
      className="logo-mark"
      src="/brand/securebase-hero.jpg"
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size }}
    />
  );
}

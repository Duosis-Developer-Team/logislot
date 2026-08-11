/**
 * Login için tema-uyumlu animasyonlu zemin — sürüklenen aurora orb'lar + maskeli
 * nokta deseni. Light modda beyaz→mavi gradient (page seviyesinde), dark modda navy.
 */
export function LoginBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="animate-aurora absolute -left-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-primary/15 blur-3xl dark:bg-primary/25" />
      <div
        className="animate-aurora absolute -bottom-48 -right-40 h-[36rem] w-[36rem] rounded-full bg-accent/15 blur-3xl dark:bg-accent/20"
        style={{ animationDelay: "6s" }}
      />
      <div className="absolute left-1/2 top-[-10%] h-[26rem] w-[46rem] -translate-x-1/2 rounded-full bg-primary/[0.06] blur-3xl dark:bg-primary/10" />

      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, hsl(var(--foreground) / 0.06) 1px, transparent 0)",
          backgroundSize: "30px 30px",
          maskImage:
            "radial-gradient(ellipse 80% 70% at 50% 45%, black, transparent 78%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 70% at 50% 45%, black, transparent 78%)",
        }}
      />
    </div>
  );
}

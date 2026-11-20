import { Biohazard, CarFront, CircleDot, Flame, HeartPulse, LifeBuoy, Wrench, type LucideProps } from "lucide-react";
import type { Categoria } from "@/lib/types";

const ICONOS: Record<Categoria, React.ComponentType<LucideProps>> = {
  incendio: Flame,
  medica: HeartPulse,
  rescate: LifeBuoy,
  vehicular: CarFront,
  matpel: Biohazard,
  servicio: Wrench,
  otro: CircleDot,
};

export function IconoCategoria({ categoria, ...props }: { categoria: Categoria } & LucideProps) {
  const I = ICONOS[categoria] ?? CircleDot;
  return <I aria-hidden {...props} />;
}

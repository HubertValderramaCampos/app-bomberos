import type { Metadata } from "next";
import { DetalleEmergencia } from "./DetalleEmergencia";

export async function generateMetadata(props: PageProps<"/emergencia/[parte]">): Promise<Metadata> {
  const { parte } = await props.params;
  return { title: `Parte ${parte}` };
}

export default async function Page(props: PageProps<"/emergencia/[parte]">) {
  const { parte } = await props.params;
  return <DetalleEmergencia parte={parte} />;
}

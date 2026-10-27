import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = { title: "AgentArena", description: "A local workbench for simulated agents" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

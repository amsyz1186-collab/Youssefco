import {
  Archive,
  Clapperboard,
  Code2,
  Film,
  ImageIcon,
  Languages,
  LayoutTemplate,
  Mic,
} from "lucide-react";

const MAP = { Archive, Clapperboard, Code2, Film, ImageIcon, Languages, LayoutTemplate, Mic };
export function StudioIcon({ name, className }: { name: keyof typeof MAP; className?: string }) {
  const I = MAP[name];
  return <I className={className} />;
}

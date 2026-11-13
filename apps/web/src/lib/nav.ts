import type { ComponentType } from "react";
import { BoardsIcon, BrandsIcon, DiscoverIcon, SettingsIcon, StudioIcon, TrackingIcon, type IconProps } from "@/components/icons/nav-icons";

export interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<IconProps>;
  /** Phase in which the page gets real functionality. */
  phase: number;
  shortcut?: string;
}

export const NAV: NavItem[] = [
  { href: "/discover", label: "Discover", icon: DiscoverIcon, phase: 1, shortcut: "G D" },
  { href: "/brands", label: "Brands", icon: BrandsIcon, phase: 1, shortcut: "G B" },
  { href: "/boards", label: "Boards", icon: BoardsIcon, phase: 2 },
  { href: "/tracking", label: "Tracking", icon: TrackingIcon, phase: 1, shortcut: "G T" },
  { href: "/lab", label: "Brand Lab", icon: StudioIcon, phase: 4 },
];

export const NAV_FOOTER: NavItem[] = [{ href: "/settings", label: "Settings", icon: SettingsIcon, phase: 0, shortcut: "G S" }];

/** Phase we're currently building — pages for later phases show a roadmap state. */
export const CURRENT_PHASE = 4;

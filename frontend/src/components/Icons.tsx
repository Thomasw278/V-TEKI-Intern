import type { ReactNode, SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 18, children, ...rest }: P & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export const IconHome = (p: P) => <Base {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9v11h13V9" /><path d="M10 20v-5h4v5" /></Base>;
export const IconFile = (p: P) => <Base {...p}><path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z" /><path d="M14 3v5h5" /><path d="M8.5 13h7M8.5 16.5h4.5" /></Base>;
export const IconCheck = (p: P) => <Base {...p}><path d="M4.5 12.5 9.5 17.5 19.5 6.5" /></Base>;
export const IconScan = (p: P) => <Base {...p}><path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" /><path d="M4 12h16" /></Base>;
export const IconTable = (p: P) => <Base {...p}><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10" /></Base>;
export const IconCalc = (p: P) => <Base {...p}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 7h8M8.5 11.5h1M12 11.5h1M15.5 11.5v5M8.5 15h1M12 15h1" /></Base>;
export const IconLeaf = (p: P) => <Base {...p}><path d="M5 19c0-8 5-14 15-14 0 9-5 15-12 15-1.7 0-3-.4-3-1z" /><path d="M5 19 13 11" /></Base>;
export const IconReport = (p: P) => <Base {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></Base>;
export const IconSettings = (p: P) => <Base {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></Base>;
export const IconMenu = (p: P) => <Base {...p}><path d="M4 6h16M4 12h16M4 18h16" /></Base>;
export const IconX = (p: P) => <Base {...p}><path d="M6 6l12 12M18 6 6 18" /></Base>;
export const IconArrow = (p: P) => <Base {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Base>;
export const IconBack = (p: P) => <Base {...p}><path d="M19 12H5M11 18l-6-6 6-6" /></Base>;
export const IconChevron = (p: P) => <Base {...p}><path d="M7 10l5 5 5-5" /></Base>;
export const IconChevronLeft = (p: P) => <Base {...p}><path d="M14 6l-6 6 6 6" /></Base>;
export const IconChevronRight = (p: P) => <Base {...p}><path d="M10 6l6 6-6 6" /></Base>;
export const IconUpload = (p: P) => <Base {...p}><path d="M12 16V4M6.5 9.5 12 4l5.5 5.5" /><path d="M4 20h16" /></Base>;
export const IconDownload = (p: P) => <Base {...p}><path d="M12 4v12M6.5 10.5 12 16l5.5-5.5" /><path d="M4 20h16" /></Base>;
export const IconLock = (p: P) => <Base {...p}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Base>;
export const IconTrash = (p: P) => <Base {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Base>;
export const IconRefresh = (p: P) => <Base {...p}><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></Base>;
export const IconPlus = (p: P) => <Base {...p}><path d="M12 5v14M5 12h14" /></Base>;
export const IconMinus = (p: P) => <Base {...p}><path d="M5 12h14" /></Base>;
export const IconSearch = (p: P) => <Base {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></Base>;
export const IconBell = (p: P) => <Base {...p}><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></Base>;
export const IconFactor = (p: P) => <Base {...p}><path d="M5 5h9l5 5v9H5z" /><path d="M9 14h6M9 10.5h3" /><circle cx="17.5" cy="17.5" r="0.5" /></Base>;
export const IconShield = (p: P) => <Base {...p}><path d="M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6z" /><path d="m9 12 2.2 2.2L15.5 10" /></Base>;
export const IconHistory = (p: P) => <Base {...p}><path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5" /><path d="M4 4v4.5h4.5M12 8v4.5l3 2" /></Base>;
export const IconFlow = (p: P) => <Base {...p}><path d="M3 6h5c4 0 4 12 8 12h5M3 18h5c4 0 4-12 8-12h5" /></Base>;
export const IconZoomIn = (p: P) => <Base {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2M11 8.5v5M8.5 11h5" /></Base>;
export const IconZoomOut = (p: P) => <Base {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2M8.5 11h5" /></Base>;
export const IconUsers = (p: P) => <Base {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.5 3.3-5.5 6.5-5.5s5.9 2 6.5 5.5" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2 .7 3.2 2.5 3.5 5.2" /></Base>;
export const IconSpark = (p: P) => <Base {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" /></Base>;
export const IconEye = (p: P) => <Base {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Base>;
export const IconRotate = (p: P) => <Base {...p}><path d="M4 4v6h6" /><path d="M5 15a7.5 7.5 0 1 0 1.6-8.2L4 10" /></Base>;
export const IconWarn = (p: P) => <Base {...p}><path d="M12 4 2.8 19.5h18.4z" /><path d="M12 10v4.5M12 17.2v.3" /></Base>;
export const IconSun = (p: P) => <Base {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /></Base>;
export const IconMoon = (p: P) => <Base {...p}><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></Base>;
export const IconBuilding = (p: P) => <Base {...p}><path d="M4 21V5.5A1.5 1.5 0 0 1 5.5 4h8A1.5 1.5 0 0 1 15 5.5V21" /><path d="M15 10h3.5a1.5 1.5 0 0 1 1.5 1.5V21M2.5 21h19M8 8h3M8 12h3M8 16h3" /></Base>;
export const IconInbox = (p: P) => <Base {...p}><path d="M3.5 13.5 6 5.5A1.5 1.5 0 0 1 7.4 4.5h9.2A1.5 1.5 0 0 1 18 5.5l2.5 8" /><path d="M3.5 13.5V18a1.5 1.5 0 0 0 1.5 1.5h14a1.5 1.5 0 0 0 1.5-1.5v-4.5H15a3 3 0 0 1-6 0z" /></Base>;
export const IconLogout = (p: P) => <Base {...p}><path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H15" /><path d="M10 16.5 5.5 12 10 7.5M5.5 12H15" /></Base>;
export const IconKey = (p: P) => <Base {...p}><circle cx="8" cy="15" r="4" /><path d="M11 12l8.5-8.5M16 7l2.5 2.5M14 9l2 2" /></Base>;
export const IconSwap = (p: P) => <Base {...p}><path d="M7 4 3.5 7.5 7 11M3.5 7.5h13M17 13l3.5 3.5L17 20M20.5 16.5h-13" /></Base>;
export const IconSend = (p: P) => <Base {...p}><path d="M21 3 10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5z" /></Base>;
export const IconUndo = (p: P) => <Base {...p}><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></Base>;
export const IconGlobe = (p: P) => <Base {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" /></Base>;

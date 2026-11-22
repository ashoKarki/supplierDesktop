import type { ReactNode, SVGProps } from "react";

const paths = {
  arrowRight: <path d="M5 12h14m-6-6 6 6-6 6" />,
  arrowUpRight: <path d="M7 17 17 7M7 7h10v10" />,
  building: <><path d="M4 20h16M6 20V5l7-2v17M13 8h5v12" /><path d="M9 8h.01M9 11h.01M9 14h.01M16 11h.01M16 14h.01" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,
  file: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5M9 12h6M9 16h6" /></>,
  grid: <><rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="4" width="7" height="7" rx="1" /><rect x="4" y="13" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>,
  logout: <><path d="M10 17v2H5V5h5v2M14 8l4 4-4 4M8 12h10" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>,
  users: <><path d="M16 20v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1M16 4a4 4 0 0 1 0 8M20 20v-1a4 4 0 0 0-3-3.87" /><circle cx="10" cy="7" r="4" /></>,
  warning: <><path d="M12 3 2.7 19h18.6L12 3ZM12 9v4M12 16h.01" /></>,
} satisfies Record<string, ReactNode>;

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: keyof typeof paths }) {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {paths[name]}
    </svg>
  );
}

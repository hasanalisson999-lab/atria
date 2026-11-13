/** Templates re-mount on every navigation, so this gives each page a soft entrance. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="flex animate-enter flex-col gap-8">{children}</div>;
}

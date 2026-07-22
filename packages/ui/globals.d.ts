declare module '*.css' {
  const styles: { [className: string]: string };
  export default styles;
}

interface WindowContext {
  secretRoute?: string;
  contest?: { id?: string; name: string };
  arenaLayouts?: unknown[];
}

interface Window {
  Context: WindowContext;
}

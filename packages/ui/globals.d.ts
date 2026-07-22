declare module '*.css' {
  const styles: { [className: string]: string };
  export default styles;
}

declare module '*.png?inline' {
  const source: string;
  export default source;
}

interface WindowContext {
  clientMode?: boolean;
  secretRoute?: string;
  contest?: { id?: string; name: string };
  arenaLayouts: unknown[];
  sshEnabled?: boolean;
}

interface Window {
  Context: WindowContext;
}

/// <reference types="vite/client" />

declare module '*.module.css' {
  const classes: { [key: string]: string };
  export default classes;
}

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string
  readonly VITE_API_ORIGIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

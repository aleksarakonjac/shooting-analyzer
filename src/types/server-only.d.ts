// Next.js resolves 'server-only' itself (installing the package is optional): it fails the build when a client
// module imports a file marked with it. This declaration lets TypeScript accept the bare import.
declare module 'server-only';

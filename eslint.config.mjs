import { FlatCompat } from '@eslint/eslintrc';
const compat = new FlatCompat({baseDirectory: import.meta.dirname});
const config = [...compat.extends('next/core-web-vitals','next/typescript'), { ignores: ['.next/**','.next-dev/**','.next-dev-backup-*/**','node_modules/**','next-env.d.ts','.npm-cache/**','output/**','tmp/**'] }, { rules: {'@next/next/no-img-element':'off'} }];
export default config;

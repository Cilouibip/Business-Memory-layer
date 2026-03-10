import { UnipileClient } from 'unipile-node-sdk';

const dsn = process.env.UNIPILE_DSN;
const accessToken = process.env.UNIPILE_ACCESS_TOKEN;

if (!dsn || !accessToken) {
  console.warn('Missing Unipile env vars: UNIPILE_DSN, UNIPILE_ACCESS_TOKEN');
}

export const unipileClient = new UnipileClient(dsn ?? '', accessToken ?? '');

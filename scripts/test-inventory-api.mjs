import { readFileSync } from 'node:fs';
import jwt from 'jsonwebtoken';

const env = readFileSync('/opt/rip-market/backend/.env', 'utf8');
const secret = env.match(/JWT_SECRET="([^"]+)"/)?.[1];
const userId = process.argv[2] ?? '56b39a4b-2141-47ff-aa1e-b682f03dc6a9';
const token = jwt.sign({ sub: userId, role: 'BUYER' }, secret, { expiresIn: '1h' });

const res = await fetch('http://127.0.0.1:3000/api/v1/inventory', {
  headers: { Authorization: `Bearer ${token}` },
});
const text = await res.text();
console.log('status', res.status);
console.log(text.slice(0, 1500));

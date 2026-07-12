import { redirect } from 'next/navigation';

// The proxy (src/proxy.ts) handles smart redirect based on af_token cookie.
// If we somehow land here, send to login as a safe fallback.
export default function Home() {
  redirect('/login');
}


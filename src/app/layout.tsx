import type { Metadata } from 'next';
import './globals.css';
import Application from '../components/application/Application';
export const metadata: Metadata = { title: 'DealFlow360', description: 'Connected sales operations' };
export default function Layout({children}:{children:React.ReactNode}) { return <html lang="en"><body><Application />{children}</body></html>; }

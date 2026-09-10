import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Команда AI — помощник по найму', description: 'Вакансии, интервью, обратная связь и адаптация — в одном чате.', icons: { icon: '/favicon.svg' } };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="ru"><body>{children}</body></html>; }

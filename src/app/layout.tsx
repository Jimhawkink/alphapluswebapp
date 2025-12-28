import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
    title: 'Alpha Plus Hotel System',
    description: 'Professional Hotel Management System',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body className={inter.className}>
                {/* Modern Toast Notifications - Top Position */}
                <Toaster
                    position="top-center"
                    reverseOrder={false}
                    gutter={8}
                    containerStyle={{
                        top: 20,
                    }}
                    toastOptions={{
                        // Default options
                        duration: 3000,
                        style: {
                            background: '#fff',
                            color: '#1e293b',
                            padding: '12px 16px',
                            borderRadius: '12px',
                            fontSize: '14px',
                            fontWeight: '500',
                            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
                            maxWidth: '320px',
                        },
                        // Success toast - Light faded green
                        success: {
                            duration: 2500,
                            style: {
                                background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
                                color: '#065f46',
                                border: '1px solid #a7f3d0',
                            },
                            iconTheme: {
                                primary: '#10b981',
                                secondary: '#ecfdf5',
                            },
                        },
                        // Error toast - Light faded red
                        error: {
                            duration: 3500,
                            style: {
                                background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
                                color: '#991b1b',
                                border: '1px solid #fecaca',
                            },
                            iconTheme: {
                                primary: '#ef4444',
                                secondary: '#fef2f2',
                            },
                        },
                    }}
                />
                {children}
            </body>
        </html>
    );
}

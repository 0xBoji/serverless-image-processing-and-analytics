'use client';

import { useTheme } from 'next-themes';
import { Sun, Moon, CloudCog } from 'lucide-react';
import { useEffect, useState } from 'react';

export function Header() {
    const { theme, setTheme, resolvedTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const toggleTheme = () => {
        setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
    };

    return (
        <header className="fixed top-4 left-4 right-4 z-50">
            <nav className="glass-nav mx-auto max-w-7xl px-6 py-4">
                <div className="flex items-center justify-between">
                    {/* Logo & Title */}
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-secondary)]">
                            <CloudCog className="h-6 w-6 text-white" />
                        </div>
                        <div>
                            <h1 className="font-heading text-lg font-semibold tracking-tight" style={{ fontFamily: 'Poppins, sans-serif' }}>
                                Image Analytics
                            </h1>
                            <p className="text-xs text-[var(--color-text-muted)]">
                                Powered by AWS Rekognition
                            </p>
                        </div>
                    </div>

                    {/* Theme Toggle */}
                    <button
                        onClick={toggleTheme}
                        className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-background-secondary)] transition-smooth hover:bg-[var(--color-border)] cursor-pointer"
                        aria-label="Toggle theme"
                    >
                        {mounted && (
                            resolvedTheme === 'dark' ? (
                                <Sun className="h-5 w-5 text-[var(--color-accent)]" />
                            ) : (
                                <Moon className="h-5 w-5 text-[var(--color-primary)]" />
                            )
                        )}
                    </button>
                </div>
            </nav>
        </header>
    );
}

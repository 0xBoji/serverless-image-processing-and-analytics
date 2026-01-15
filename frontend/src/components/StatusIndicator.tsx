'use client';

import { Loader2, CheckCircle2, CloudUpload, Sparkles, AlertCircle } from 'lucide-react';

export type ProcessingStatus = 'idle' | 'uploading' | 'analyzing' | 'completed' | 'error';

interface StatusIndicatorProps {
    status: ProcessingStatus;
    message?: string;
}

const statusConfig: Record<ProcessingStatus, {
    icon: React.ReactNode;
    label: string;
    color: string;
    bgColor: string;
}> = {
    idle: {
        icon: <CloudUpload className="h-5 w-5" />,
        label: 'Ready to Upload',
        color: 'text-[var(--color-text-muted)]',
        bgColor: 'bg-[var(--color-border)]',
    },
    uploading: {
        icon: <Loader2 className="h-5 w-5 animate-spin" />,
        label: 'Uploading...',
        color: 'text-[var(--color-primary)]',
        bgColor: 'bg-blue-500/20',
    },
    analyzing: {
        icon: <Sparkles className="h-5 w-5 animate-pulse" />,
        label: 'Analyzing with AI...',
        color: 'text-purple-500',
        bgColor: 'bg-purple-500/20',
    },
    completed: {
        icon: <CheckCircle2 className="h-5 w-5" />,
        label: 'Completed!',
        color: 'text-green-500',
        bgColor: 'bg-green-500/20',
    },
    error: {
        icon: <AlertCircle className="h-5 w-5" />,
        label: 'Error',
        color: 'text-red-500',
        bgColor: 'bg-red-500/20',
    },
};

export function StatusIndicator({ status, message }: StatusIndicatorProps) {
    const config = statusConfig[status];

    return (
        <div className={`inline-flex items-center gap-3 rounded-full px-4 py-2 ${config.bgColor} transition-all duration-300`}>
            <span className={`relative ${config.color}`}>
                {(status === 'uploading' || status === 'analyzing') && (
                    <span className={`absolute inset-0 rounded-full ${config.bgColor} status-pulse`} />
                )}
                {config.icon}
            </span>
            <span className={`text-sm font-medium ${config.color}`}>
                {message || config.label}
            </span>
        </div>
    );
}

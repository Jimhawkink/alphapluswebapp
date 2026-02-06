import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

// 30 minutes in milliseconds
const TIMEOUT_DURATION = 30 * 60 * 1000;

export function useSessionTimeout() {
    const router = useRouter();

    const logout = useCallback(() => {
        // Clear user data
        localStorage.removeItem('user');

        // Show notification
        toast.error('Session expired due to inactivity');

        // Redirect to login
        router.push('/');
    }, [router]);

    useEffect(() => {
        // Only run on client side
        if (typeof window === 'undefined') return;

        let timeoutId: NodeJS.Timeout;

        const resetTimer = () => {
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = setTimeout(logout, TIMEOUT_DURATION);
        };

        // Events that reset the timer
        const events = [
            'mousedown',
            'mousemove',
            'keypress',
            'scroll',
            'touchstart'
        ];

        // Set up event listeners
        events.forEach(event => {
            window.addEventListener(event, resetTimer);
        });

        // Initialize timer
        resetTimer();

        // Cleanup
        return () => {
            if (timeoutId) clearTimeout(timeoutId);
            events.forEach(event => {
                window.removeEventListener(event, resetTimer);
            });
        };
    }, [logout]);
}

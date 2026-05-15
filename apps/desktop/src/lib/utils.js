import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
/**
 * shadcn-style cn() helper.
 * Combines clsx conditional class building with tailwind-merge deduplication.
 *
 * @example
 * cn("px-4 py-2", isActive && "bg-blue-500", className)
 */
export function cn(...inputs) {
    return twMerge(clsx(inputs));
}

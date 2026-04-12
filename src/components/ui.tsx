import React from 'react';
import { cn } from '../lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
}

export function Card({ children, className, title, subtitle }: CardProps) {
  return (
    <div className={cn("bg-surface-container-lowest rounded-xl p-6 shadow-sm border border-black/5", className)}>
      {(title || subtitle) && (
        <div className="mb-6">
          {title && <h3 className="text-lg font-bold font-headline text-primary">{title}</h3>}
          {subtitle && <p className="text-sm text-on-surface-variant">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  );
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children?: React.ReactNode;
  className?: string;
}

export function Button({ 
  children, 
  className, 
  variant = 'primary', 
  size = 'md', 
  ...props 
}: ButtonProps) {
  const variants = {
    primary: "bg-primary text-white hover:opacity-90 shadow-lg shadow-primary/10",
    secondary: "bg-surface-container-high text-primary hover:bg-surface-container-highest",
    ghost: "bg-transparent text-on-surface-variant hover:bg-surface-container-low",
    danger: "bg-error text-white hover:opacity-90 shadow-lg shadow-error/10"
  };
  
  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base"
  };

  return (
    <button 
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-bold transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  className?: string;
}

export function Input({ className, ...props }: InputProps) {
  return (
    <input 
      className={cn(
        "bg-surface-container-high border-none rounded-lg px-4 py-2 text-sm w-full focus:ring-2 focus:ring-primary/20 focus:bg-surface-container-lowest transition-all outline-none",
        className
      )}
      {...props}
    />
  );
}

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
        <div className="p-6 border-b border-black/5 flex justify-between items-center">
          <h3 className="text-xl font-bold font-headline text-primary">{title}</h3>
          <button onClick={onClose} className="text-on-surface-variant hover:text-primary transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
